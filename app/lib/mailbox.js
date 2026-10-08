// The authenticated Gmail address, looked up once per process. One container
// serves one mailbox, so the answer cannot change while the process lives.
let cached = null;

export function getMailboxAddress(gmail) {
  if (!cached) {
    cached = gmail.users
      .getProfile({ userId: "me" })
      .then((r) => r.data.emailAddress)
      .catch((e) => {
        cached = null;
        throw e;
      });
  }
  return cached;
}

export function resetMailboxCache() {
  cached = null;
}
