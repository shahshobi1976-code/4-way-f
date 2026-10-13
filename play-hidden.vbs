' Silent launcher for Ludo Emperor 4 Way.
' Starts the game's local server in the background (hidden, no console window)
' and opens the game in the default browser. The server keeps running after this
' script exits, so the link stays valid.
'
' Paths are relative to THIS file, so the folder can be moved or renamed freely.

Option Explicit

Dim fso, shell, here, base, server, url, cmd, port
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' the folder this script lives in
here = fso.GetParentFolderName(WScript.ScriptFullName)
server = fso.BuildPath(here, "Run with local server\serve.mjs")
port = 8080
url = "http://127.0.0.1:" & port & "/"

If Not fso.FileExists(server) Then
    MsgBox "Could not find the game server at:" & vbCrLf & server & vbCrLf & vbCrLf & _
           "The folder may be incomplete. You can still play by double-clicking" & vbCrLf & _
           "PLAY-WEB.html or PLAY-MOBILE.html.", 16, "Ludo Emperor"
    WScript.Quit 1
End If

' node serve.mjs <port>   -- window style 0 = hidden, bWaitOnReturn False
cmd = "cmd /c node """ & server & """ " & port
shell.Run cmd, 0, False

' give the server a moment to bind the port, then open the game
WScript.Sleep 2500
shell.Run url, 1, False
