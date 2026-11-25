import { describe, expect, it } from "vitest";
import { DEFAULT_STUN, iceServers, parseCloudflare, staticTurn } from "../server/ice";

describe("voice ICE servers", () => {
  it("falls back to STUN when no relay is configured", async () => {
    expect(staticTurn({})).toBeNull();
    expect(await iceServers({})).toEqual(DEFAULT_STUN);
  });

  it("adds a static TURN relay from the environment", async () => {
    const env = { TURN_URLS: " turn:relay.example:3478?transport=udp , turns:relay.example:5349,https://nope ", TURN_USERNAME: "u", TURN_CREDENTIAL: "p" };
    expect(staticTurn(env)).toEqual({ urls: ["turn:relay.example:3478?transport=udp", "turns:relay.example:5349"], username: "u", credential: "p" });
    expect(await iceServers(env)).toEqual([...DEFAULT_STUN, staticTurn(env)]);
  });

  it("reads Cloudflare replies and drops port 53 URLs browsers refuse", () => {
    const reply = {
      iceServers: [
        { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
        {
          urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"],
          username: "u",
          credential: "c",
        },
      ],
    };
    expect(parseCloudflare(reply)).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"], username: undefined, credential: undefined },
      { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "c" },
    ]);
    // The older endpoint answers with a single object.
    expect(parseCloudflare({ iceServers: { urls: "turn:a:3478", username: "x", credential: "y" } })).toEqual([
      { urls: ["turn:a:3478"], username: "x", credential: "y" },
    ]);
    expect(parseCloudflare(null)).toEqual([]);
  });
});
