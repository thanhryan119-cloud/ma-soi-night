"use client";

// Open-mic voice chat: a small WebRTC mesh (every participant connects to every
// other one). The Socket.IO server only relays the signaling messages.
//
// Joining the call means listening: everyone in a social phase joins on their
// own, so whoever speaks is heard. The mic is a separate switch. Each peer
// connection carries one two-way audio transceiver from the start, so turning
// the mic on is just `replaceTrack` (no renegotiation).

import { useEffect, useRef, useState } from "react";
import { emitAck, getSocket, storage, type AckResult } from "./socket";

export interface VoicePeer {
  socketId: string;
  from: string;
  muted: boolean;
  listenOnly: boolean;
}

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
const LISTEN_KEY = "msn:voiceListen";
const MAX_ICE_RESTARTS = 2;

type Signal = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

class VoiceClient {
  pcs = new Map<string, RTCPeerConnection>();
  audios = new Map<string, HTMLAudioElement>();
  pendingIce = new Map<string, RTCIceCandidateInit[]>();
  restarts = new Map<string, number>();
  /** Peers this client offered to (it alone restarts ICE for them, so offers never cross). */
  offered = new Set<string>();
  stream: MediaStream | null = null;
  self: VoicePeer | null = null;
  peers = new Map<string, VoicePeer>();
  levels = new Map<string, number>();
  /** The browser refused to start playback until the next tap. */
  blocked = false;
  /** The user wants to hear the table (stored; off only after "stop listening"). */
  wantListen = storage.get<boolean>(LISTEN_KEY) ?? true;
  joining = false;
  private ice: RTCIceServer[] = FALLBACK_ICE;
  private ctx: AudioContext | null = null;
  private selfAnalyser: AnalyserNode | null = null;
  private timer: number | null = null;
  /** The socket dropped while in the call: join again once the room is back. */
  private rejoin = false;

  constructor(private onChange: () => void) {
    const s = getSocket();
    s.on("voice:signal", this.onSignal);
    s.on("voice:peer-joined", this.onPeerJoined);
    s.on("voice:peer-left", this.onPeerLeft);
    s.on("voice:peer-state", this.onPeerState);
    s.on("voice:end", this.onEnd);
    s.on("disconnect", this.onDisconnect);
    s.on("state", this.onRoomState);
    // Any tap lets blocked audio start (autoplay rules, iOS especially).
    for (const ev of ["pointerdown", "keydown", "touchend"]) document.addEventListener(ev, this.unlock, true);
  }

  dispose() {
    this.leave(false);
    const s = getSocket();
    s.off("voice:signal", this.onSignal);
    s.off("voice:peer-joined", this.onPeerJoined);
    s.off("voice:peer-left", this.onPeerLeft);
    s.off("voice:peer-state", this.onPeerState);
    s.off("voice:end", this.onEnd);
    s.off("disconnect", this.onDisconnect);
    s.off("state", this.onRoomState);
    for (const ev of ["pointerdown", "keydown", "touchend"]) document.removeEventListener(ev, this.unlock, true);
  }

  get joined() {
    return !!this.self;
  }

  get micOn() {
    return !!this.stream;
  }

  setWantListen(on: boolean) {
    this.wantListen = on;
    storage.set(LISTEN_KEY, on);
    this.onChange();
  }

  /** Joins the call as a listener (no mic prompt). */
  async join(): Promise<AckResult> {
    if (this.self || this.joining) return { ok: true };
    this.joining = true;
    this.unlock();
    try {
      const r = await emitAck<{ self: VoicePeer; peers: VoicePeer[]; iceServers: RTCIceServer[] }>("voice:join", {
        muted: !this.liveTrack(),
      });
      if (!r.ok || !r.self) return r;
      if (r.iceServers?.length) this.ice = r.iceServers;
      this.self = r.self;
      if (r.self.listenOnly) this.stopStream();
      this.startMeter();
      for (const p of r.peers ?? []) {
        this.peers.set(p.socketId, p);
        void this.connect(p.socketId, true);
      }
      this.onChange();
      return { ok: true };
    } finally {
      this.joining = false;
      this.onChange();
    }
  }

  /** Turns the mic on (asks for permission inside the click). */
  async enableMic(): Promise<AckResult> {
    if (!this.self || this.self.listenOnly) return { ok: false };
    if (!this.stream) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        this.stream = null;
        return { ok: false, error: "err.micDenied" };
      }
      // The call may have ended while the permission prompt was open.
      if (!this.self || this.self.listenOnly) {
        this.stopStream();
        return { ok: false };
      }
      this.watchSelf(this.stream);
    }
    this.setMuted(false);
    return { ok: true };
  }

  leave(notify = true) {
    if (notify && this.self) emitAck("voice:leave");
    for (const id of [...this.pcs.keys()]) this.drop(id);
    this.stopStream();
    this.self = null;
    this.rejoin = false;
    this.peers.clear();
    this.levels.clear();
    this.blocked = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.onChange();
  }

  setMuted(muted: boolean) {
    if (!this.self || this.self.listenOnly || !this.stream) return;
    const track = this.stream.getAudioTracks()[0] ?? null;
    if (track) track.enabled = !muted;
    for (const pc of this.pcs.values()) this.attachMic(pc);
    this.self = { ...this.self, muted };
    getSocket().emit("voice:state", { muted });
    this.onChange();
  }

  /** Resumes playback after a user gesture. */
  unlock = () => {
    if (!this.ctx && typeof AudioContext !== "undefined") {
      try {
        this.ctx = new AudioContext();
      } catch {}
    }
    if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {});
    if (!this.blocked) return;
    this.blocked = false;
    for (const a of this.audios.values()) this.play(a);
    this.onChange();
  };

  private liveTrack() {
    const t = this.stream?.getAudioTracks()[0];
    return t && t.readyState === "live" && t.enabled ? t : null;
  }

  private stopStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.selfAnalyser = null;
    this.levels.delete("self");
  }

  private signal(to: string, data: Signal) {
    getSocket().emit("voice:signal", { to, data });
  }

  /** Puts the mic (or nothing) on the connection's audio sender. */
  private attachMic(pc: RTCPeerConnection) {
    const tr = pc.getTransceivers().find((t) => (t.receiver.track?.kind ?? "audio") === "audio");
    if (!tr) return;
    const track = this.self && !this.self.listenOnly ? (this.stream?.getAudioTracks()[0] ?? null) : null;
    if (tr.sender.track !== track) tr.sender.replaceTrack(track).catch(() => {});
  }

  private play(a: HTMLAudioElement) {
    a.play().catch((err: Error) => {
      if (err?.name === "NotAllowedError" && !this.blocked) {
        this.blocked = true;
        this.onChange();
      }
    });
  }

  private audioFor(id: string) {
    let a = this.audios.get(id);
    if (!a) {
      a = document.createElement("audio");
      a.autoplay = true;
      a.setAttribute("playsinline", "");
      a.style.display = "none";
      document.body.appendChild(a);
      this.audios.set(id, a);
    }
    // Honest clients also mute whoever the server muted (silenced, dead, not on the stand).
    a.muted = this.peers.get(id)?.muted ?? true;
    return a;
  }

  private async connect(id: string, initiator: boolean) {
    this.pcs.get(id)?.close();
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    this.pcs.set(id, pc);
    pc.onicecandidate = (e) => e.candidate && this.signal(id, { candidate: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      const a = this.audioFor(id);
      a.srcObject = new MediaStream([e.track]);
      this.play(a);
    };
    pc.onconnectionstatechange = () => {
      if (this.pcs.get(id) !== pc) return;
      if (pc.connectionState === "connected") this.restarts.delete(id);
      if (pc.connectionState !== "failed") return;
      // Try a fresh set of candidates before giving up on this peer.
      const n = this.restarts.get(id) ?? 0;
      if (this.offered.has(id) && n < MAX_ICE_RESTARTS) {
        this.restarts.set(id, n + 1);
        void this.offer(id, pc, true);
      } else if (!this.offered.has(id)) {
        // The other side restarts; drop only if it never comes back.
        setTimeout(() => {
          if (this.pcs.get(id) === pc && pc.connectionState === "failed") this.drop(id);
        }, 15_000);
      } else {
        console.warn("[voice] could not connect to", id);
        this.drop(id);
      }
    };
    if (initiator) {
      this.offered.add(id);
      pc.addTransceiver("audio", { direction: "sendrecv" });
      this.attachMic(pc);
      await this.offer(id, pc, false);
    }
    return pc;
  }

  private async offer(id: string, pc: RTCPeerConnection, iceRestart: boolean) {
    try {
      const offer = await pc.createOffer({ iceRestart });
      await pc.setLocalDescription(offer);
      this.signal(id, { sdp: pc.localDescription!.toJSON() });
    } catch (err) {
      console.warn("[voice]", err);
    }
  }

  private drop(id: string) {
    this.pcs.get(id)?.close();
    this.pcs.delete(id);
    this.pendingIce.delete(id);
    this.restarts.delete(id);
    this.offered.delete(id);
    const a = this.audios.get(id);
    if (a) {
      a.srcObject = null;
      a.remove();
      this.audios.delete(id);
    }
    this.levels.delete(id);
  }

  private watchSelf(stream: MediaStream) {
    this.unlock();
    if (!this.ctx) return;
    try {
      const src = this.ctx.createMediaStreamSource(stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      this.selfAnalyser = an;
    } catch {}
  }

  /** Who is talking: the mic's level for self, RTP audio levels for the others. */
  private startMeter() {
    if (this.timer) return;
    const buf = new Uint8Array(128);
    this.timer = window.setInterval(() => {
      let changed = false;
      const set = (id: string, on: boolean) => {
        if ((this.levels.get(id) ?? 0) !== (on ? 1 : 0)) {
          this.levels.set(id, on ? 1 : 0);
          changed = true;
        }
      };
      if (this.selfAnalyser) {
        this.selfAnalyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        set("self", peak > 12);
      }
      const now = performance.now();
      for (const [id, pc] of this.pcs) {
        let level = 0;
        for (const r of pc.getReceivers()) {
          for (const src of r.getSynchronizationSources?.() ?? []) {
            if (now - src.timestamp < 1000) level = Math.max(level, src.audioLevel ?? 0);
          }
        }
        set(id, level > 0.02);
      }
      if (changed) this.onChange();
    }, 200);
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
          // Answer with the offered transceiver both ways, mic attached (or empty).
          for (const tr of pc.getTransceivers()) if (tr.direction !== "stopped") tr.direction = "sendrecv";
          this.attachMic(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.signal(from, { sdp: pc.localDescription!.toJSON() });
        } else if (pc) {
          await pc.setRemoteDescription(data.sdp);
        }
        if (pc) for (const c of this.pendingIce.get(from) ?? []) await pc.addIceCandidate(c).catch(() => {});
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
    // A newcomer (or someone back from a reconnect) sends us an offer.
    this.drop(p.socketId);
    this.peers.set(p.socketId, p);
    this.onChange();
  };

  private onPeerLeft = ({ socketId }: { socketId: string }) => {
    this.peers.delete(socketId);
    this.drop(socketId);
    this.onChange();
  };

  private onPeerState = (p: VoicePeer) => {
    if (!this.self) return;
    if (p.socketId === this.self.socketId) {
      // The server can make us listen only mid-call (the defense, a death).
      this.self = { ...this.self, ...p };
      if (p.listenOnly) this.stopStream();
      for (const pc of this.pcs.values()) this.attachMic(pc);
    } else if (this.peers.has(p.socketId)) {
      this.peers.set(p.socketId, p);
      const a = this.audios.get(p.socketId);
      if (a) {
        a.muted = p.muted;
        // Unmuting by script may need playback to start again (autoplay rules).
        if (!p.muted && a.paused && a.srcObject) this.play(a);
      }
    }
    this.onChange();
  };

  private onEnd = () => this.leave(false);

  /** The server forgets us when the socket drops: clean up and come back on the next state. */
  private onDisconnect = () => {
    if (!this.self) return;
    const mic = this.stream;
    this.stream = null; // keep the mic through the reconnect
    this.leave(false);
    this.stream = mic;
    this.rejoin = true;
  };

  private onRoomState = () => {
    if (!this.rejoin) return;
    this.rejoin = false;
    void this.join().then((r) => {
      if (!r.ok) this.stopStream();
      else if (this.stream && this.self && !this.self.listenOnly) {
        this.watchSelf(this.stream);
        this.setMuted(!this.liveTrack());
      }
    });
  };
}

// One client per page, shared by every voice bar (the panel remounts between phases on phones).
let shared: VoiceClient | null = null;
let users = 0;
const listeners = new Set<() => void>();

/** Hook around the page's VoiceClient. */
export function useVoice() {
  const [, setTick] = useState(0);
  const ref = useRef<VoiceClient | null>(null);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    listeners.add(bump);
    users++;
    shared ??= new VoiceClient(() => listeners.forEach((l) => l()));
    ref.current = shared;
    bump();
    return () => {
      listeners.delete(bump);
      users--;
      // Wait a moment: the next phase's panel usually mounts right away.
      setTimeout(() => {
        if (users === 0 && shared) {
          shared.dispose();
          shared = null;
        }
      }, 1500);
    };
  }, []);
  const v = ref.current;
  return {
    joined: !!v?.joined,
    joining: !!v?.joining,
    self: v?.self ?? null,
    peers: v ? [...v.peers.values()] : [],
    micOn: !!v?.micOn,
    blocked: !!v?.blocked,
    wantListen: v?.wantListen ?? false,
    speaking: (id: string) => (v?.levels.get(id) ?? 0) > 0,
    join: () => v?.join() ?? Promise.resolve({ ok: false } as AckResult),
    enableMic: () => v?.enableMic() ?? Promise.resolve({ ok: false } as AckResult),
    leave: () => v?.leave(),
    setMuted: (m: boolean) => v?.setMuted(m),
    setWantListen: (on: boolean) => v?.setWantListen(on),
    unlock: () => v?.unlock(),
  };
}
