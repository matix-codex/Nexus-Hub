using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

public static class RgbSdk {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr LoadLibraryEx(string file, IntPtr reserved, uint flags);
  [DllImport("kernel32.dll", CharSet=CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr library, string name);
  static T Function<T>(IntPtr library, string name) where T : class { IntPtr address = GetProcAddress(library, name); if (address == IntPtr.Zero) throw new Exception("SDK-functie ontbreekt: " + name); return Marshal.GetDelegateForFunctionPointer(address, typeof(T)) as T; }
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int Simple();
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int MsiDevices([MarshalAs(UnmanagedType.SafeArray, SafeArraySubType=VarEnum.VT_BSTR)] out string[] types, [MarshalAs(UnmanagedType.SafeArray, SafeArraySubType=VarEnum.VT_BSTR)] out string[] counts);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int MsiInfo([MarshalAs(UnmanagedType.BStr)] string type, int index, [MarshalAs(UnmanagedType.BStr)] out string name, [MarshalAs(UnmanagedType.SafeArray, SafeArraySubType=VarEnum.VT_BSTR)] out string[] styles);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int MsiColor([MarshalAs(UnmanagedType.BStr)] string type, int index, int r, int g, int b);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int MsiStyle([MarshalAs(UnmanagedType.BStr)] string type, int index, [MarshalAs(UnmanagedType.BStr)] string style);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)] struct CueDevice {
    public int type;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string id;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string serial;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string model;
    public int ledCount, channelCount;
  }
  [StructLayout(LayoutKind.Sequential)] struct LedPosition { public uint id; public double x, y; }
  [StructLayout(LayoutKind.Sequential)] struct LedColor { public uint id; public byte r, g, b, a; }
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void CueChanged(IntPtr context, IntPtr data);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int CueConnect(CueChanged callback, IntPtr context);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int CueDevices(ref int filter, int capacity, [Out] CueDevice[] devices, out int count);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int CuePositions([MarshalAs(UnmanagedType.LPStr)] string id, int capacity, [Out] LedPosition[] positions, out int count);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int CueColors([MarshalAs(UnmanagedType.LPStr)] string id, int count, [In] LedColor[] colors);
  static IntPtr msi, cue; static bool msiReady, cueStarted; static volatile int cueState;
  static CueChanged callback = delegate(IntPtr context, IntPtr data) { if (data != IntPtr.Zero) cueState = Marshal.ReadInt32(data); };
  static readonly Dictionary<string, string> deviceIds = new Dictionary<string, string>();
  static readonly Dictionary<string, string> styles = new Dictionary<string, string>();
  static IntPtr Find(string[] paths) { foreach (string file in paths) if (File.Exists(file)) { IntPtr dll = LoadLibraryEx(file, IntPtr.Zero, 0x1100); if (dll != IntPtr.Zero) return dll; } return IntPtr.Zero; }
  static void Check(int result, string source) { if (result != 0) throw new Exception(source + " SDK-code " + result + ". Controleer of de fabrikantapp draait en software-integraties zijn toegestaan."); }
  public static object Status(string provider, string sdkPath) {
    deviceIds.Clear(); styles.Clear(); var devices = new List<object>(); var providers = new List<object>();
    string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles); string x86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
    if (provider == "msi") try {
      if (msi == IntPtr.Zero) msi = Find(new string[] { sdkPath, Path.Combine(pf, @"Corsair\Corsair iCUE5 Software\plugins\MSI\MysticLight_SDK_x64.dll"), Path.Combine(x86, @"MSI\MSI Center\Mystic Light\MysticLight_SDK_x64.dll"), Path.Combine(pf, @"MSI\MSI Center\Mystic Light\MysticLight_SDK_x64.dll") });
      if (msi == IntPtr.Zero) throw new Exception("Mystic Light SDK niet gevonden. Installeer Mystic Light in MSI Center of de MSI-integratie van iCUE.");
      if (!msiReady) { Check(Function<Simple>(msi, "MLAPI_Initialize")(), "MSI"); msiReady = true; }
      string[] types, counts; Check(Function<MsiDevices>(msi, "MLAPI_GetDeviceInfo")(out types, out counts), "MSI");
      for (int i = 0; i < types.Length; i++) {
        int count; if (!int.TryParse(counts[i], out count)) continue;
        for (int led = 0; led < Math.Min(count, 128); led++) {
          string name; string[] supported; if (Function<MsiInfo>(msi, "MLAPI_GetLedInfo")(types[i], led, out name, out supported) != 0) continue;
          string style = null;
          foreach (string candidate in supported) if (candidate.Equals("Steady", StringComparison.OrdinalIgnoreCase) || candidate.Equals("Static", StringComparison.OrdinalIgnoreCase) || candidate.Equals("Direct", StringComparison.OrdinalIgnoreCase) || candidate.Equals("Direct All Sync", StringComparison.OrdinalIgnoreCase)) { style = candidate; break; }
          if (style == null) continue;
          string key = "msi:" + i + ":" + led; deviceIds[key] = types[i]; styles[key] = style;
          devices.Add(new { id = key, name = types[i] + " · " + name, provider = "MSI Mystic Light", leds = 1 });
        }
      }
      providers.Add(new { id = "msi", name = "MSI Center / Mystic Light", available = true, detail = "SDK verbonden; statische zones beschikbaar." });
    } catch (Exception error) { providers.Add(new { id = "msi", name = "MSI Center / Mystic Light", available = false, detail = error.Message }); }
    if (provider == "icue") try {
      if (cue == IntPtr.Zero) cue = Find(new string[] { Path.Combine(pf, @"GIGABYTE\Control Center\Lib\MBStorage\iCUESDK.x64_2019.dll"), Path.Combine(pf, @"Corsair\Corsair iCUE5 Software\iCUESDK.x64_2019.dll"), Path.Combine(pf, @"Corsair\Corsair iCUE5 Software\iCUESDK.x64_2022.dll") });
      if (cue == IntPtr.Zero) throw new Exception("iCUE SDK niet gevonden. Installeer de iCUE-software-integratie of GIGABYTE Control Center-integratie.");
      if (!cueStarted) { Check(Function<CueConnect>(cue, "CorsairConnect")(callback, IntPtr.Zero), "iCUE"); cueStarted = true; }
      for (int retry = 0; retry < 20 && cueState != 6 && cueState != 4; retry++) Thread.Sleep(100);
      if (cueState != 6) throw new Exception("iCUE heeft de SDK nog niet verbonden. Zet Software and Games-integraties aan in iCUE en sta Nexus toe (status " + cueState + ").");
      CueDevice[] buffer = new CueDevice[64]; int total, filter = -1; Check(Function<CueDevices>(cue, "CorsairGetDevices")(ref filter, buffer.Length, buffer, out total), "iCUE");
      for (int i = 0; i < total; i++) { if (buffer[i].ledCount <= 0) continue; string key = "icue:" + i; deviceIds[key] = buffer[i].id; devices.Add(new { id = key, name = buffer[i].model, provider = "Corsair iCUE", leds = buffer[i].ledCount }); }
      providers.Add(new { id = "icue", name = "Corsair iCUE", available = true, detail = "SDK verbonden; gedeelde verlichting." });
    } catch (Exception error) { providers.Add(new { id = "icue", name = "Corsair iCUE", available = false, detail = error.Message }); }
    return new { devices = devices, providers = providers };
  }
  public static void Apply(string key, int r, int g, int b) {
    string id; if (!deviceIds.TryGetValue(key, out id)) throw new Exception("Apparaat gewijzigd. Zoek RGB-apparaten opnieuw.");
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) throw new Exception("Ongeldige kleur.");
    if (key.StartsWith("msi:")) {
      int index = int.Parse(key.Split(':')[2]); Check(Function<MsiStyle>(msi, "MLAPI_SetLedStyle")(id, index, styles[key]), "MSI"); Check(Function<MsiColor>(msi, "MLAPI_SetLedColor")(id, index, r, g, b), "MSI");
    } else {
      LedPosition[] positions = new LedPosition[512]; int count; Check(Function<CuePositions>(cue, "CorsairGetLedPositions")(id, positions.Length, positions, out count), "iCUE");
      LedColor[] colors = new LedColor[count]; for (int i = 0; i < count; i++) colors[i] = new LedColor { id = positions[i].id, r = (byte)r, g = (byte)g, b = (byte)b, a = 255 };
      Check(Function<CueColors>(cue, "CorsairSetLedColors")(id, count, colors), "iCUE");
    }
  }
  public static void Stop() { try { if (msiReady) Function<Simple>(msi, "MLAPI_Release")(); } catch {} try { if (cueStarted) Function<Simple>(cue, "CorsairDisconnect")(); } catch {} }
}
