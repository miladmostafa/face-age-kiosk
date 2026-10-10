const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const shots = ['attract', 'consent', 'quiz', 'missing-id', 'settings'];
const output = path.join(__dirname, '..', 'docs', 'screenshots');

app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true });
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#14110e',
    webPreferences: { offscreen: true },
  });
  for (const shot of shots) {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'), {
      query: { demo: '1', shot },
    });
    await new Promise((resolve) => setTimeout(resolve, 700));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(output, `${shot}.png`), image.toPNG());
  }
  app.quit();
});
