export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === `/.well-known/webfinger`) {
      return handleWebfinger(url);
    }
    if (request.method === "GET" && url.pathname.startsWith("/actor/")) {
      return handleActor(url, env);
    }
    if (request.method === "POST" && url.pathname.startsWith("/inbox/")) {
      return handleInbox(request, env);
    }
    return new Response("Not Found", { status: 404 });
  }
};

function handleWebfinger(url) {
  const resource = url.searchParams.get("resource");
  const match = /^acct:([^@]+)@([^@]+)$/.exec(resource);
  if (!match) return new Response("Bad Request", { status: 400 });

  const [_, name, domain] = match;
  return Response.json({
    subject: `acct:${name}@${domain}`,
    links: [
      {
        rel: "self",
        type: "application/activity+json",
        href: `https://${domain}/actor/${name}`,
      },
    ],
  });
}

async function handleActor(url, env) {
  const name = url.pathname.split("/").pop();
  const actor = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${env.DOMAIN}/actor/${name}`,
    type: "Person",
    preferredUsername: name,
    inbox: `https://${env.DOMAIN}/inbox/${name}`,
    followers: `https://${env.DOMAIN}/followers/${name}`,
    publicKey: {
      id: `https://${env.DOMAIN}/actor/${name}#main-key`,
      owner: `https://${env.DOMAIN}/actor/${name}`,
      publicKeyPem: env.PUBLIC_KEY_PEM,
    },
    name: env.ACTOR_NAME || "Broadcast Bot",
    icon: {
      type: "Image",
      mediaType: "image/png",
      url: env.ACTOR_ICON,
    },
  };
  return Response.json(actor);
}

async function handleInbox(request, env) {
  const body = await request.json();
  const type = body.type;

  if (type === "Follow") {
    const follower = body.actor;
    const name = new URL(request.url).pathname.split("/").pop();
    await env.FOLLOWERS.put(name + ":" + follower, "1");
    const accept = {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: `${body.id}/accept`,
      type: "Accept",
      actor: `https://${env.DOMAIN}/actor/${name}`,
      object: body,
    };
    await sendSignedRequest(follower + "/inbox", accept, env);
    return new Response("Follow accepted");
  }

  if (type === "Create" && body.object && body.object.type === "Note") {
    const name = new URL(request.url).pathname.split("/").pop();
    const followers = await listFollowers(env, name);

    const activity = {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: body.id + "#forwarded",
      type: "Create",
      actor: `https://${env.DOMAIN}/actor/${name}`,
      object: body.object,
    };

    for (const follower of followers) {
      const inbox = follower + "/inbox";
      await sendSignedRequest(inbox, activity, env);
    }

    return new Response("Broadcasted");
  }

  return new Response("Ignored", { status: 202 });
}

async function listFollowers(env, name) {
  const list = await env.FOLLOWERS.list({ prefix: name + ":" });
  return list.keys.map(k => k.name.split(":")[1]);
}

async function sendSignedRequest(inboxUrl, body, env) {
  const url = new URL(inboxUrl);
  const headers = {
    "Host": url.host,
    "Date": new Date().toUTCString(),
    "Content-Type": "application/activity+json",
    Digest: "SHA-256=" + await digestBody(body),
  };

  const signature = await signRequest({
    method: "POST",
    url,
    headers,
    privateKeyPem: env.PRIVATE_KEY_PEM,
  });

  headers["Signature"] = signature;

  await fetch(inboxUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function digestBody(body) {
  const data = new TextEncoder().encode(JSON.stringify(body));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function signRequest({ method, url, headers, privateKeyPem }) {
  const headersToSign = ["(request-target)", "host", "date", "digest"];
  const signingString = headersToSign.map(h => {
    if (h === "(request-target)") {
      return `(request-target): ${method.toLowerCase()} ${url.pathname}`;
    }
    return `${h}: ${headers[h]}`;
  }).join("\n");

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingString)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  return `keyId="https://${url.host}/actor/board#main-key",headers="${headersToSign.join(" ")}",signature="${signature}"`;
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----.*?-----/g, "").replace(/\s/g, "");
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
