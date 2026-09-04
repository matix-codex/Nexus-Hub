using System;
using System.Runtime.InteropServices;
using System.Net.NetworkInformation;

namespace Nexus {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int flow, int mask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    int RegisterEndpointNotificationCallback(IntPtr client);
    int UnregisterEndpointNotificationCallback(IntPtr client);
  }
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("D666063F-1587-4E43-81F1-B948E807363F")]
  interface IMMDevice {
    int Activate(ref Guid iid, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object result);
    int OpenPropertyStore(int access, out IntPtr properties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out int state);
  }
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr notify);
    int UnregisterControlChangeNotify(IntPtr notify);
    int GetChannelCount(out uint count);
    int SetMasterVolumeLevel(float level, Guid context);
    int SetMasterVolumeLevelScalar(float level, Guid context);
    int GetMasterVolumeLevel(out float level);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(uint channel, float level, Guid context);
    int SetChannelVolumeLevelScalar(uint channel, float level, Guid context);
    int GetChannelVolumeLevel(uint channel, out float level);
    int GetChannelVolumeLevelScalar(uint channel, out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid context);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    int GetVolumeStepInfo(out uint step, out uint count);
    int VolumeStepUp(Guid context);
    int VolumeStepDown(Guid context);
    int QueryHardwareSupport(out uint mask);
    int GetVolumeRange(out float min, out float max, out float increment);
  }
  public class AudioState { public double volume; public bool muted; public bool available; }
  public class NetworkState { public long received; public long sent; public bool connected; public string name; }
  public static class Windows {
    private static IAudioEndpointVolume Endpoint(bool mic) {
      object enumerator = new MMDeviceEnumerator(); IMMDevice device = null;
      try {
        Marshal.ThrowExceptionForHR(((IMMDeviceEnumerator)enumerator).GetDefaultAudioEndpoint(mic ? 1 : 0, mic ? 2 : 0, out device));
        Guid iid = typeof(IAudioEndpointVolume).GUID; object result;
        Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out result));
        return (IAudioEndpointVolume)result;
      } finally { if (device != null) Marshal.ReleaseComObject(device); Marshal.ReleaseComObject(enumerator); }
    }
    public static AudioState GetAudio(bool mic) {
      IAudioEndpointVolume endpoint = null;
      try { endpoint = Endpoint(mic); float volume; bool muted; Marshal.ThrowExceptionForHR(endpoint.GetMasterVolumeLevelScalar(out volume)); Marshal.ThrowExceptionForHR(endpoint.GetMute(out muted)); return new AudioState { volume = Math.Round(volume * 100), muted = muted, available = true }; }
      catch { return new AudioState { available = false }; }
      finally { if (endpoint != null) Marshal.ReleaseComObject(endpoint); }
    }
    public static void SetVolume(bool mic, double volume) {
      var endpoint = Endpoint(mic);
      try { Marshal.ThrowExceptionForHR(endpoint.SetMasterVolumeLevelScalar((float)(Math.Max(0, Math.Min(100, volume)) / 100), Guid.Empty)); }
      finally { Marshal.ReleaseComObject(endpoint); }
    }
    public static void SetMute(bool mic, bool muted) {
      var endpoint = Endpoint(mic);
      try { Marshal.ThrowExceptionForHR(endpoint.SetMute(muted, Guid.Empty)); }
      finally { Marshal.ReleaseComObject(endpoint); }
    }
    public static NetworkState Network() {
      var state = new NetworkState();
      foreach (var nic in NetworkInterface.GetAllNetworkInterfaces()) {
        if (nic.OperationalStatus != OperationalStatus.Up || (nic.NetworkInterfaceType != NetworkInterfaceType.Ethernet && nic.NetworkInterfaceType != NetworkInterfaceType.Wireless80211)) continue;
        var data = nic.GetIPv4Statistics(); state.received += data.BytesReceived; state.sent += data.BytesSent; state.connected = true;
        if (state.name == null) state.name = nic.Name;
      }
      return state;
    }
  }
}
