import path from "node:path";

// Where auth.js reads credentials.json and writes token.json. One config
// directory per mailbox: `node auth.js ../config-robin` mints Robin's token.
export function authPaths(configDirArg, cwd = process.cwd()) {
  const dir = path.resolve(cwd, configDirArg || path.join("..", "config"));
  return {
    dir,
    credPath: path.join(dir, "credentials.json"),
    tokenPath: path.join(dir, "token.json"),
  };
}
