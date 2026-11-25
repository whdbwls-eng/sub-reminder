# 매일 오전 9시에 notify.js 실행하는 작업 스케줄러 등록 (PC가 꺼져 있었으면 켜질 때 실행)
$node = (Get-Command node).Source
$dir  = $PSScriptRoot
$act  = New-ScheduledTaskAction -Execute $node -Argument "notify.js" -WorkingDirectory $dir
$trg  = New-ScheduledTaskTrigger -Daily -At 9:00
$set  = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName "SubReminder" -Action $act -Trigger $trg -Settings $set -Force
