import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/cli/app.ts', 'utf8');

// Fix submitInput to handle awaitingInput
const oldSubmit = `  private submitInput(): void {
    const text = this.input;
    if (!text.trim()) return;
    this.popupVisible = false;
    this.pushLine(text, "user");
    this.input = "";
    this.processing = true;
    this.loader?.start();
    this.requestRender();
    this.callbacks.onInput(text).then(() => {
      this.processing = false;
      this.loader?.stop();
      this.requestRender();
    }).catch(() => {
      this.processing = false;
      this.loader?.stop();
      this.requestRender();
    });
  }`;

const newSubmit = `  private submitInput(): void {
    const text = this.input;
    if (!text.trim()) return;

    // If awaiting inline input (e.g. API key), resolve the promise
    if (this.awaitingInput && this.pendingInputResolve) {
      this.input = "";
      this.awaitingInput = false;
      this.promptLabel = "";
      const resolve = this.pendingInputResolve;
      this.pendingInputResolve = null;
      this.requestRender();
      resolve(text);
      return;
    }

    this.popupVisible = false;
    this.pushLine(text, "user");
    this.input = "";
    this.processing = true;
    this.loader?.start();
    this.requestRender();
    this.callbacks.onInput(text).then(() => {
      this.processing = false;
      this.loader?.stop();
      this.requestRender();
    }).catch(() => {
      this.processing = false;
      this.loader?.stop();
      this.requestRender();
    });
  }`;

if (content.includes(oldSubmit)) {
  content = content.replace(oldSubmit, newSubmit);
  console.log('submitInput: replaced');
} else {
  console.log('submitInput: NOT FOUND - dumping actual content around submitInput');
  const idx = content.indexOf('private submitInput()');
  if (idx >= 0) {
    console.log(JSON.stringify(content.slice(idx, idx + 600)));
  }
}

writeFileSync('src/cli/app.ts', content);
