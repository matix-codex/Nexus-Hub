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
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
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
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);
  class Managed { public string Id; public IntPtr Window; public Placement Original; public IntPtr Style; public bool WasVisible; }
  static readonly Dictionary<string, Managed> windows = new Dictionary<string, Managed>();
  static readonly object gate = new object(); static IntPtr parent; static string active; static bool visible;
  static int x = 90, y = 150, width = 900, height = 650, parentWidth = 1100;
  static Timer timer;
  static bool Match(IntPtr hwnd, HashSet<uint> processes) { uint pid; GetWindowThreadProcessId(hwnd, out pid); return processes.Contains(pid); }
  static bool IsCloaked(IntPtr hwnd) { int value; return DwmGetWindowAttribute(hwnd, 14, out value, 4) == 0 && value != 0; }
  public static string Attach(string id, long host) {
    lock (gate) {
      Hide(); parent = new IntPtr(host);
      Managed item;
      if (windows.TryGetValue(id, out item) && !IsWindow(item.Window)) windows.Remove(id);
      if (!windows.TryGetValue(id, out item)) {
        var processes = new HashSet<uint>();
        foreach (string name in id == "whatsapp" ? new[] { "WhatsApp", "WhatsApp.Root" } : id == "xbox" ? new[] { "XboxPcApp" } : new[] { id })
          foreach (Process process in Process.GetProcessesByName(name)) { using (process) { try { processes.Add((uint)process.Id); } catch {} } }
        IntPtr found = IntPtr.Zero; long area = 0; bool foundVisible = false;
        EnumWindows(delegate(IntPtr hwnd, IntPtr data) {
          bool isVisible = IsWindowVisible(hwnd);
          if (IsCloaked(hwnd)) return true;
          // A tray app can keep its real main window hidden after activation.
          // Hidden message/helper windows have no caption or resize frame.
          if (!isVisible && (GetWindowLongPtr(hwnd, -16).ToInt64() & 0xC40000L) == 0) return true;
          bool match = Match(hwnd, processes);
          if (!match) EnumChildWindows(hwnd, delegate(IntPtr child, IntPtr unused) { if (Match(child, processes)) match = true; return !match; }, IntPtr.Zero);
          if (!match) return true;
          Rect rect; GetWindowRect(hwnd, out rect); long size = (long)(rect.Right - rect.Left) * (rect.Bottom - rect.Top);
          if (IsIconic(hwnd)) { Placement position = new Placement(); position.length = Marshal.SizeOf(typeof(Placement)); if (GetWindowPlacement(hwnd, ref position)) size = (long)(position.normal.Right-position.normal.Left)*(position.normal.Bottom-position.normal.Top); }
          if (size > 10000 && ((!foundVisible && isVisible) || (foundVisible == isVisible && size > area))) { found = hwnd; area = size; foundVisible = isVisible; } return true;
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
  public static void Hide(string id) { lock (gate) { if (String.IsNullOrEmpty(id) || active == id) Hide(); } }
  public static void Show() { lock (gate) { visible = true; Tick(); } }
  public static object State() { lock (gate) {
    IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
    try {
      var data = new List<object>();
      foreach (Managed item in windows.Values) {
        Rect rect; GetWindowRect(item.Window, out rect);
        Point center = new Point { X = (rect.Left + rect.Right) / 2, Y = (rect.Top + rect.Bottom) / 2 };
        IntPtr hit = GetAncestor(WindowFromPoint(center), 2);
        uint targetPid, hitPid; GetWindowThreadProcessId(item.Window, out targetPid); GetWindowThreadProcessId(hit, out hitPid);
        data.Add(new { id = item.Id, alive = IsWindow(item.Window), visible = IsWindowVisible(item.Window), x = rect.Left, y = rect.Top, width = rect.Right - rect.Left, height = rect.Bottom - rect.Top,
          toolWindow = (GetWindowLongPtr(item.Window, -20).ToInt64() & 0x80) != 0,
          topmost = (GetWindowLongPtr(item.Window, -20).ToInt64() & 8) != 0,
          interactive = hit == item.Window || (targetPid != 0 && targetPid == hitPid) });
      }
      return data;
    } finally { if (previous != IntPtr.Zero) SetThreadDpiAwarenessContext(previous); }
  } }
  static void Tick() {
    lock (gate) {
      if (parent == IntPtr.Zero) return;
      if (!IsWindow(parent)) { ReleaseAll(); return; }
      bool hostVisible = visible && IsWindowVisible(parent) && !IsIconic(parent);
      // Delayed activation from a launcher must not resurface a previous app
      // over the current workspace or a Nexus dialog.
      foreach (Managed other in windows.Values)
        if ((!hostVisible || other.Id != active) && IsWindow(other.Window) && IsWindowVisible(other.Window)) ShowWindow(other.Window, 0);
      Managed item; if (active == null || !windows.TryGetValue(active, out item) || !IsWindow(item.Window)) return;
      if (!hostVisible) return;
      IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
      try {
        Rect client; GetClientRect(parent, out client); Point origin = new Point(); ClientToScreen(parent, ref origin);
        double scale = (double)(client.Right - client.Left) / parentWidth;
        IntPtr foreground = GetForegroundWindow(); bool hostFocus = foreground == parent || foreground == item.Window;
        bool hostTopmost = (GetWindowLongPtr(parent, -20).ToInt64() & 8) != 0;
        bool appTopmost = (GetWindowLongPtr(item.Window, -20).ToInt64() & 8) != 0;
        // HWND_TOP cannot place an ordinary window above a topmost Nexus window.
        // Match the host's band, and remove the temporary topmost status when disabled.
        // HWND_TOPMOST changes the band. Once both windows are topmost,
        // HWND_TOP moves the managed app to the front of that band.
        IntPtr after = hostTopmost ? (appTopmost ? IntPtr.Zero : new IntPtr(-1)) : appTopmost ? new IntPtr(-2) : IntPtr.Zero;
        bool changeOrder = hostTopmost || appTopmost || hostFocus;
        SetWindowPos(item.Window, after, origin.X + (int)(x * scale), origin.Y + (int)(y * scale), Math.Max(100, (int)(width * scale)), Math.Max(100, (int)(height * scale)), (uint)(0x10 | 0x40 | 0x200 | (changeOrder ? 0 : 0x4)));
        // A click on the frameless host brings Nexus above the separately owned
        // app window. Return focus to the active app after Nexus handled that click.
        if (hostFocus) SetForegroundWindow(item.Window);
      } finally { if (previous != IntPtr.Zero) SetThreadDpiAwarenessContext(previous); }
    }
  }
  public static void Release(string id) {
    lock (gate) {
      Managed item; if (!windows.TryGetValue(id, out item)) return;
      if (IsWindow(item.Window)) {
        SetWindowLongPtr(item.Window, -20, item.Style);
        SetWindowPos(item.Window, new IntPtr((item.Style.ToInt64() & 8) != 0 ? -1 : -2), 0, 0, 0, 0, 0x1 | 0x2 | 0x10 | 0x20 | 0x200);
        SetWindowPlacement(item.Window, ref item.Original); ShowWindow(item.Window, item.WasVisible ? 8 : 0);
      }
      windows.Remove(id); if (active == id) active = null;
    }
  }
  public static void ReleaseAll() { lock (gate) { foreach (string id in new List<string>(windows.Keys)) Release(id); if (timer != null) { timer.Dispose(); timer = null; } parent = IntPtr.Zero; } }
}
