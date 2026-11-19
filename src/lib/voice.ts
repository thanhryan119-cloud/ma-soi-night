"use client";

// Open-mic voice chat: a small WebRTC mesh (every participant connects to every
// other one). The Socket.IO server only relays the signaling messages.

import { useEffect, useRef, useState } from "react";
import { emitAck, getSocket, type AckResult } from "./socket";

export interface VoicePeer {
  socketId: string;
  from: string;
  muted: boolean;
  listenOnly: boolean;
}

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

type Signal = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

class VoiceClient {
  pcs = new Map<string, RTCPeerConnection>();
  audios = new Map<string, HTMLAudioElement>();
  pendingIce = new Map<string, RTCIceCandidateInit[]>();
  stream: MediaStream | null = null;
  self: VoicePeer | null = null;
  peers = new Map<string, VoicePeer>();
  levels = new Map<string, number>();
  private ctx: AudioContext | null = null;
  private analysers = new Map<string, AnalyserNode>();
  private timer: number | null = null;

  constructor(private onChange: () => void) {
    const s = getSocket();
    s.on("voice:signal", this.onSignal);
    s.on("voice:peer-joined", this.onPeerJoined);
    s.on("voice:peer-left", this.onPeerLeft);
    s.on("voice:peer-state", this.onPeerState);
    s.on("voice:end", this.onEnd);
  }

  dispose() {
    this.leave(false);
    const s = getSocket();
    s.off("voice:signal", this.onSignal);
    s.off("voice:peer-joined", this.onPeerJoined);
    s.off("voice:peer-left", this.onPeerLeft);
    s.off("voice:peer-state", this.onPeerState);
    s.off("voice:end", this.onEnd);
  }

  get joined() {
    return !!this.self;
  }

  async join(): Promise<AckResult> {
    if (this.self) return { ok: true };
    // Ask for the mic first (inside the click), so the browser shows its prompt.
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this.stream = null;
    }
    const r = await emitAck<{ self: VoicePeer; peers: VoicePeer[] }>("voice:join", { muted: !this.stream });
    if (!r.ok || !r.self) {
      this.stopStream();
      return r;
    }
    this.self = r.self;
    if (r.self.listenOnly) this.stopStream();
    this.ctx = new AudioContext();
    if (this.stream) this.watchLevel("self", this.stream);
    this.startMeter();
    for (const p of r.peers ?? []) {
      this.peers.set(p.socketId, p);
      await this.connect(p.socketId, true);
    }
    this.onChange();
    if (!this.stream && !r.self.listenOnly) return { ok: false, error: "err.micDenied" };
    return { ok: true };
  }

  leave(notify = true) {
    if (notify && this.self) emitAck("voice:leave");
    for (const id of [...this.pcs.keys()]) this.drop(id);
    this.stopStream();
    this.self = null;
    this.peers.clear();
    this.levels.clear();
    this.analysers.clear();
    if (this.timer) cancelAnimationFrame(this.timer);
    this.timer = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.onChange();
  }

  setMuted(muted: boolean) {
    if (!this.self || this.self.listenOnly || !this.stream) return;
    this.stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.self = { ...this.self, muted };
    getSocket().emit("voice:state", { muted });
    this.onChange();
  }

  private stopStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private signal(to: string, data: Signal) {
    getSocket().emit("voice:signal", { to, data });
  }

  private addLocal(pc: RTCPeerConnection) {
    if (this.stream) for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream);
    else pc.addTransceiver("audio", { direction: "recvonly" });
  }

  private async connect(id: string, initiator: boolean) {
    const pc = new RTCPeerConnection(ICE);
    this.pcs.set(id, pc);
    pc.onicecandidate = (e) => e.candidate && this.signal(id, { candidate: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      let audio = this.audios.get(id);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        this.audios.set(id, audio);
      }
      audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      audio.play().catch(() => {});
      this.watchLevel(id, audio.srcObject as MediaStream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") this.drop(id);
    };
    if (initiator) {
      this.addLocal(pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signal(id, { sdp: pc.localDescription!.toJSON() });
    }
    return pc;
  }

  private drop(id: string) {
    this.pcs.get(id)?.close();
    this.pcs.delete(id);
    const a = this.audios.get(id);
    if (a) {
      a.srcObject = null;
      this.audios.delete(id);
    }
    this.analysers.delete(id);
    this.levels.delete(id);
  }

  private watchLevel(id: string, stream: MediaStream) {
    if (!this.ctx || !stream.getAudioTracks().length) return;
    try {
      const src = this.ctx.createMediaStreamSource(stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      this.analysers.set(id, an);
    } catch {}
  }

  private startMeter() {
    const buf = new Uint8Array(128);
    let last = 0;
    const tick = (t: number) => {
      this.timer = requestAnimationFrame(tick);
      if (t - last < 150) return;
      last = t;
      let changed = false;
      for (const [id, an] of this.analysers) {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        const speaking = peak > 12 ? 1 : 0;
        if ((this.levels.get(id) ?? 0) !== speaking) {
          this.levels.set(id, speaking);
          changed = true;
        }
      }
      if (changed) this.onChange();
    };
    this.timer = requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------- events --

  private onSignal = async ({ from, data }: { from: string; data: Signal }) => {
    if (!this.self) return;
    let pc = this.pcs.get(from);
    try {
      if (data.sdp) {
        if (data.sdp.type === "offer") {
          if (!pc) pc = await this.connect(from, false);
          await pc.setRemoteDescription(data.sdp);
          // Reuses the offered transceiver; a listen-only answerer just receives.
          if (this.stream) for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.signal(from, { sdp: pc.localDescription!.toJSON() });
        } else if (pc) {
          await pc.setRemoteDescription(data.sdp);
        }
        for (const c of this.pendingIce.get(from) ?? []) await pc!.addIceCandidate(c);
        this.pendingIce.delete(from);
      } else if (data.candidate) {
        if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate);
        else this.pendingIce.set(from, [...(this.pendingIce.get(from) ?? []), data.candidate]);
      }
    } catch (err) {
      console.warn("[voice]", err);
    }
  };

  private onPeerJoined = (p: VoicePeer) => {
    if (!this.self || p.socketId === this.self.socketId) return;
    this.peers.set(p.socketId, p); // the newcomer sends us an offer
    this.onChange();
  };

  private onPeerLeft = ({ socketId }: { socketId: string }) => {
    this.peers.delete(socketId);
    this.drop(socketId);
    this.onChange();
  };

  private onPeerState = (p: VoicePeer) => {
    if (this.self && p.socketId === this.self.socketId) return;
    if (this.peers.has(p.socketId)) this.peers.set(p.socketId, p);
    this.onChange();
  };

  private onEnd = () => this.leave(false);
}

/** Hook around a single VoiceClient for the page. */
export function useVoice() {
  const ref = useRef<VoiceClient | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    ref.current = new VoiceClient(() => setTick((n) => n + 1));
    return () => ref.current?.dispose();
  }, []);
  const v = ref.current;
  return {
    joined: !!v?.joined,
    self: v?.self ?? null,
    peers: v ? [...v.peers.values()] : [],
    speaking: (id: string) => (v?.levels.get(id) ?? 0) > 0,
    join: () => v?.join() ?? Promise.resolve({ ok: false } as AckResult),
    leave: () => v?.leave(),
    setMuted: (m: boolean) => v?.setMuted(m),
  };
}
