import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

const patchTargets = [
  {
    filePath: path.join(
      rootDir,
      'node_modules/.pnpm/node_modules/@elevenlabs/client/dist/utils/events.js',
    ),
    oldText: `export function isValidSocketEvent(event) {
    return !!event.type;
}`,
    newText: `export function isValidSocketEvent(event) {
    if (!event || typeof event !== "object" || typeof event.type !== "string") {
        return false;
    }
    if (event.type === "error") {
        return !!event.error_event && typeof event.error_event === "object";
    }
    return true;
}`,
  },
  {
    filePath: path.join(
      rootDir,
      'node_modules/.pnpm/node_modules/@elevenlabs/client/dist/BaseConversation.js',
    ),
    oldText: `    handleErrorEvent(event) {
        const errorType = event.error_event.error_type;
        const message = event.error_event.message || event.error_event.reason || "Unknown error";`,
    newText: `    handleErrorEvent(event) {
        if (!event?.error_event || typeof event.error_event !== "object") {
            this.onError("Server error event was missing payload", {
                rawEvent: event,
            });
            return;
        }
        const errorType = event.error_event.error_type;
        const message = event.error_event.message || event.error_event.reason || "Unknown error";`,
  },
];

for (const target of patchTargets) {
  if (!fs.existsSync(target.filePath)) {
    continue;
  }

  const current = fs.readFileSync(target.filePath, 'utf8');

  if (current.includes(target.newText)) {
    continue;
  }

  if (!current.includes(target.oldText)) {
    console.warn(`Skipping ElevenLabs patch for ${target.filePath}`);
    continue;
  }

  fs.writeFileSync(
    target.filePath,
    current.replace(target.oldText, target.newText),
    'utf8',
  );
}
