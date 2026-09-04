using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

// Native apps keep their own process and account. Never reparent a foreign HWND:
// cross-process SetParent breaks WinUI/DPI and can destroy an app on host exit.
public static class DesktopApps {
  delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct Placement { public int length, flags, showCmd; public Point min, max; public Rect normal; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd, ref Point point);
  [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr hwnd, ref Placement placement);
  [DllImport("user32.dll")] static extern bool SetWindowPlacement(IntPtr hwnd, ref Placement placement);
  [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);
  [DllImport("user32.dll", SetLastError=true)] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int w, int h, uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int cmd);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  class Managed { public string Id; public IntPtr Window; public Placement Original; public IntPtr Style; public bool WasVisible; }
  static readonly Dictionary<string, Managed> windows = new Dictionary<string, Managed>();
  static readonly object gate = new object(); static IntPtr parent; static string active; static bool visible;
  static int x = 90, y = 150, width = 900, height = 650, parentWidth = 1100;
  static Timer timer;
  static bool Match(IntPtr hwnd, string id) {
    try { uint pid; GetWindowThreadProcessId(hwnd, out pid); string name = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant();
      return id == "discord" ? name == "discord" : id == "spotify" ? name == "spotify" : id == "whatsapp" && (name == "whatsapp" || name == "whatsapp.root");
    } catch { return false; }
  }
  public static string Attach(string id, long host) {
    lock (gate) {
      Hide(); parent = new IntPtr(host);
      Managed item;
      if (windows.TryGetValue(id, out item) && !IsWindow(item.Window)) windows.Remove(id);
      if (!windows.TryGetValue(id, out item)) {
        IntPtr found = IntPtr.Zero; long area = 0;
        EnumWindows(delegate(IntPtr hwnd, IntPtr data) {
          bool match = Match(hwnd, id);
          if (!match) EnumChildWindows(hwnd, delegate(IntPtr child, IntPtr unused) { if (Match(child, id)) match = true; return !match; }, IntPtr.Zero);
          Rect rect; GetWindowRect(hwnd, out rect); long size = (long)(rect.Right - rect.Left) * (rect.Bottom - rect.Top);
          if (match && IsWindowVisible(hwnd) && size > area && size > 10000) { found = hwnd; area = size; } return true;
        }, IntPtr.Zero);
        if (found == IntPtr.Zero) throw new Exception("Het Windows-appvenster is nog niet beschikbaar. Open de app en probeer opnieuw.");
        Placement original = new Placement(); original.length = Marshal.SizeOf(typeof(Placement)); GetWindowPlacement(found, ref original);
        item = new Managed { Id = id, Window = found, Original = original, Style = GetWindowLongPtr(found, -20), WasVisible = IsWindowVisible(found) };
        windows[id] = item;
        // Hide only this managed window from the taskbar; restore its exact style on release.
        ShowWindow(found, 0);
        SetWindowLongPtr(found, -20, new IntPtr((item.Style.ToInt64() & ~0x40000L) | 0x80L));
        ShowWindow(found, 9);
      }
      active = id; visible = true;
      if (timer == null) timer = new Timer(delegate(object state) { Tick(); }, null, 100, 200);
      Tick(); SetForegroundWindow(item.Window); return id;
    }
  }
  public static void Bounds(int left, int top, int w, int h, int pw) { lock (gate) { x = left; y = top; width = w; height = h; parentWidth = Math.Max(1, pw); Tick(); } }
  public static void Hide() { lock (gate) { visible = false; foreach (Managed item in windows.Values) if (IsWindow(item.Window)) ShowWindow(item.Window, 0); } }
  public static void Show() { lock (gate) { visible = true; Tick(); } }
  public static object State() { lock (gate) { var data = new List<object>(); foreach (Managed item in windows.Values) { Rect rect; GetWindowRect(item.Window, out rect); data.Add(new { id = item.Id, alive = IsWindow(item.Window), visible = IsWindowVisible(item.Window), x = rect.Left, y = rect.Top, width = rect.Right - rect.Left, height = rect.Bottom - rect.Top, toolWindow = (GetWindowLongPtr(item.Window, -20).ToInt64() & 0x80) != 0 }); } return data; } }
  static void Tick() {
    lock (gate) {
      if (parent == IntPtr.Zero) return;
      if (!IsWindow(parent)) { ReleaseAll(); return; }
      Managed item; if (active == null || !windows.TryGetValue(active, out item) || !IsWindow(item.Window)) return;
      if (!visible || !IsWindowVisible(parent) || IsIconic(parent)) { ShowWindow(item.Window, 0); return; }
      IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
      try {
        Rect client; GetClientRect(parent, out client); Point origin = new Point(); ClientToScreen(parent, ref origin);
        double scale = (double)(client.Right - client.Left) / parentWidth;
        IntPtr foreground = GetForegroundWindow(); bool hostFocus = foreground == parent || foreground == item.Window;
        SetWindowPos(item.Window, IntPtr.Zero, origin.X + (int)(x * scale), origin.Y + (int)(y * scale), Math.Max(100, (int)(width * scale)), Math.Max(100, (int)(height * scale)), (uint)(0x10 | 0x40 | (hostFocus ? 0 : 0x4)));
      } finally { if (previous != IntPtr.Zero) SetThreadDpiAwarenessContext(previous); }
    }
  }
  public static void Release(string id) {
    lock (gate) {
      Managed item; if (!windows.TryGetValue(id, out item)) return;
      if (IsWindow(item.Window)) { SetWindowLongPtr(item.Window, -20, item.Style); SetWindowPlacement(item.Window, ref item.Original); ShowWindow(item.Window, item.WasVisible ? 8 : 0); }
      windows.Remove(id); if (active == id) active = null;
    }
  }
  public static void ReleaseAll() { lock (gate) { foreach (string id in new List<string>(windows.Keys)) Release(id); if (timer != null) { timer.Dispose(); timer = null; } parent = IntPtr.Zero; } }
}
