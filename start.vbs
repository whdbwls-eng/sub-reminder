' Starts the server hidden (if the port is taken it just exits) and opens the app in its own window.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c node server.js", 0, False
WScript.Sleep 1500
sh.Run "msedge --app=http://localhost:3939 --window-size=860,920", 1, False
