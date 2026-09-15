const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  signInWithGoogle: (brokerUrl, redirectUri) =>
    ipcRenderer.invoke('oauth:google', { brokerUrl, redirectUri }),
});
