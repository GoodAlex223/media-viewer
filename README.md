## 21.06.25

Main Issues I Found and Fixed:
1. Sandbox Mode Issue

You had sandbox: true in the webPreferences, which severely restricts what the renderer process can do
Changed to sandbox: false to allow proper IPC communication

2. Console Logs in Main Process

Removed the random console.log("1"), console.log("12") etc. that were cluttering the main process

3. IPC Handler Issues

Fixed the move-file handler to properly destructure the data parameter
Added proper error handling in all IPC handlers

4. Preload Script Issues

Fixed the API exposure to include the invoke method for generic IPC calls
Added proper error handling and logging

5. Renderer Process Issues

Fixed file URL creation for Electron (file:// protocol)
Added proper error handling for when Electron API is not available
Fixed the DOM initialization to wait for DOMContentLoaded
Improved debugging with better console logging

6. Missing Window Properties

Added proper window sizing and minimum size constraints
Enabled dev tools in development mode

The main problem was likely the sandbox mode combined with improper IPC handling. These fixes should resolve the folder opening and drag-and-drop functionality.