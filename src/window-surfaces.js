'use strict';
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

class WindowSurfaces extends EventEmitter {
  constructor(executable, excludedPID = process.pid) {
    super();
    this.executable = executable;
    this.excludedPID = excludedPID;
    this.windows = [];
    this.status = 'off';
    this.child = null;
    this.timer = null;
    this.pendingAt = 0;
    this.buffer = '';
    this.fast = false;
  }

  start() {
    if (this.child || process.platform !== 'darwin') return;
    this.status = 'starting';
    this.buffer = '';
    const child = spawn(this.executable, [String(this.excludedPID)], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (this.child !== child) return;
      this.buffer += chunk;
      if (this.buffer.length > 2e6) return this.fail();
      let end;
      while ((end = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        try {
          const windows = JSON.parse(line);
          if (!Array.isArray(windows)) return this.fail();
          this.windows = windows.filter((w) => w && [w.id, w.pid, w.layer, w.x, w.y, w.width, w.height].every(Number.isFinite));
          this.pendingAt = 0;
          this.status = 'ready';
          this.emit('change');
        } catch { return this.fail(); }
      }
    });
    child.on('error', () => { if (this.child === child) this.fail(); });
    child.on('exit', () => { if (this.child === child) this.fail(); });
    child.stdin.on('error', () => { if (this.child === child) this.fail(); });
    const poll = () => {
      if (this.child !== child) return;
      if (this.pendingAt && Date.now() - this.pendingAt > 2500) return this.fail();
      if (!this.pendingAt) { this.pendingAt = Date.now(); child.stdin.write('snapshot\n'); }
      this.timer = setTimeout(poll, this.fast ? 80 : 350);
    };
    poll();
  }

  fail() { this.stop('unavailable'); }

  stop(status = 'off') {
    clearTimeout(this.timer);
    this.timer = null;
    const child = this.child;
    this.child = null;
    child?.stdin.destroy();
    child?.kill();
    this.pendingAt = 0;
    this.windows = [];
    this.status = status;
    this.emit('change');
  }
}

module.exports = { WindowSurfaces };
