## 22.06.25 - 00:14

1. medias with cancelled score are moved back to source folder and showed 

## 22.06.25

1. Move message of move error or success from center to the top of the window. 
2. Now when video is showed and video height is larger then window height video shifts out from window and also like and dislike buttons shifts out from the window. 
3. Video need to have sound and play/pause button. 
4. Buttons move to the bottom of the window, make smaller and as squares. 
5. Header with "Media Viewer" and current folder name with amount of files take up a lot of space on the screen. Make them transparent and at first plan and only show when mouse is over them . New free space is for media. 
6. Add cancel button that return previous post to this folder and show them. 
7. Near file name and size and file dimensions and aspect ratio. Make this info showed only on mouse over. 
8. Separate css styles to separate file. 

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