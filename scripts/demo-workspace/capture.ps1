# デモ用に起動したアプリのウィンドウだけを撮る。
#
#   pwsh -File scripts/demo-workspace/capture.ps1 -ProcessId 1234 -Out docs/screenshots/desktop-invoice.png
#
# プロセス ID を必ず指定する。「手前のウィンドウ」を撮る作りにすると、デモ用の起動と
# 普段使いの起動が同じ見た目なので、どちらを撮ったのか画像から判別できない。
#
# 矩形は GetWindowRect ではなく DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)
# から取る。GetWindowRect は見えないリサイズ枠を含むため、四辺に下の画面が数ピクセル
# ずつ写り込む。

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Width = 0,
  [int]$Height = 0
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class Win {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool repaint);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attr, out RECT r, int size);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  /// 見えている枠。影とリサイズ枠を除いた実際の見た目の矩形。
  public static RECT Frame(IntPtr hWnd) {
    RECT r;
    // 9 = DWMWA_EXTENDED_FRAME_BOUNDS
    if (DwmGetWindowAttribute(hWnd, 9, out r, Marshal.SizeOf(typeof(RECT))) != 0) {
      GetWindowRect(hWnd, out r);
    }
    return r;
  }
}
'@

[void][Win]::SetProcessDPIAware()

$proc = Get-Process -Id $ProcessId -ErrorAction Stop
$proc.Refresh()
$hwnd = $proc.MainWindowHandle
if ($hwnd -eq [IntPtr]::Zero) { throw "プロセス $ProcessId に表示中のウィンドウがありません。" }

# 大きさを指定したら、見えている枠がその大きさになるまで寄せる。MoveWindow は
# リサイズ枠を含む座標で動くので、指定値との差を 1 度測って引く。
if ($Width -gt 0 -and $Height -gt 0) {
  foreach ($pass in 1, 2) {
    $outer = New-Object Win+RECT
    [void][Win]::GetWindowRect($hwnd, [ref]$outer)
    $frame = [Win]::Frame($hwnd)
    $padW = ($outer.Right - $outer.Left) - ($frame.Right - $frame.Left)
    $padH = ($outer.Bottom - $outer.Top) - ($frame.Bottom - $frame.Top)
    # 位置も揃える。指定した大きさが画面からはみ出していると、はみ出した分に
    # デスクトップやタスクバーが写る（撮影範囲は画面上の矩形なので、窓の外側を撮る）。
    [void][Win]::MoveWindow($hwnd, 0 - ($outer.Left - $frame.Left), 0, $Width + $padW, $Height + $padH, $true)
    Start-Sleep -Milliseconds 400
  }
}

[void][Win]::ShowWindow($hwnd, 5)
[void][Win]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 700

$r = [Win]::Frame($hwnd)
$w = $r.Right - $r.Left
$h = $r.Bottom - $r.Top
if ($w -le 0 -or $h -le 0) { throw "ウィンドウの大きさが取れません。" }

$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
$g.Dispose()

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output "$Out $w x $h  (pid $ProcessId : $($proc.Path))"
