using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// A dedicated, sandboxed Windows web app. Only the parent process owns this
// protocol; web content receives no host objects, preload or message bridge.
internal sealed class AppHost : Form
{
    [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr window);
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    readonly IntPtr parent;
    readonly string profile;
    readonly bool testing;
    readonly WebView2 browser = new WebView2();
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly object outputLock = new object();
    readonly List<Form> popups = new List<Form>();
    CoreWebView2Environment environment;
    bool wantedVisible;
    double x = 90, y = 160, width = 900, height = 600, parentWidth = 1100;

    [STAThread] static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Console.OutputEncoding = new System.Text.UTF8Encoding(false);
        Application.Run(new AppHost(new IntPtr(long.Parse(args[0])), args[1], args.Length > 2 && args[2] == "--test"));
    }
    AppHost(IntPtr parent, string profile, bool testing)
    {
        this.parent = parent; this.profile = profile; this.testing = testing;
        Text = "Spotify · Nexus Hub"; FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false; BackColor = Color.FromArgb(17, 21, 27);
        StartPosition = FormStartPosition.Manual; Size = new Size(900, 600);
        if (parent != IntPtr.Zero) { TopLevel = false; SetParent(Handle, parent); }
        browser.Dock = DockStyle.Fill; browser.DefaultBackgroundColor = BackColor; Controls.Add(browser);
        browser.KeyDown += (s, e) => {
            string shortcut = e.KeyCode == Keys.F11 ? "fullscreen" : e.KeyCode == Keys.Escape ? "exit-fullscreen" : e.Control && e.KeyCode == Keys.K ? "search" : null;
            if (shortcut != null) { e.Handled = true; e.SuppressKeyPress = true; Send(new { shortcut = shortcut }); }
        };
        var handle = Handle;
        Task.Run(() => {
            string line;
            while ((line = Console.ReadLine()) != null) {
                var command = line;
                try { BeginInvoke(new Action(() => Dispatch(command))); } catch { break; }
            }
            try { BeginInvoke(new Action(Close)); } catch { }
        });
        var timer = new Timer { Interval = 750 };
        timer.Tick += (s, e) => { if (parent != IntPtr.Zero && !IsWindow(parent)) Close(); };
        timer.Start();
        FormClosed += (s, e) => { timer.Dispose(); foreach (var popup in popups.ToArray()) popup.Close(); };
        Initialize();
    }
    void Send(object value) { lock (outputLock) { Console.WriteLine(json.Serialize(value)); Console.Out.Flush(); } }
    protected override void SetVisibleCore(bool value) { base.SetVisibleCore(value && wantedVisible); }
    async void Initialize()
    {
        try {
            environment = await CoreWebView2Environment.CreateAsync(null, profile);
            await browser.EnsureCoreWebView2Async(environment);
            Configure(browser.CoreWebView2);
            browser.CoreWebView2.NavigationStarting += (s, e) => Send(new { loading = true, error = (string)null });
            browser.CoreWebView2.NavigationCompleted += (s, e) => {
                if (!e.IsSuccess && e.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled) {
                    Hide(); Send(new { loading = false, error = "Spotify laden mislukt: " + e.WebErrorStatus });
                } else Send(new { loading = false, error = (string)null });
            };
            browser.CoreWebView2.ProcessFailed += (s, e) => {
                Hide(); Send(new { loading = false, error = "De appverbinding is gestopt. Klik op opnieuw laden." }); Close();
            };
            Send(new { ready = true, engine = "WebView2", version = environment.BrowserVersionString });
            browser.CoreWebView2.Navigate("https://open.spotify.com/");
        } catch (Exception error) { Send(new { fatal = true, error = "Spotify heeft Microsoft Edge WebView2 Runtime nodig. " + error.Message }); Close(); }
    }
    void Configure(CoreWebView2 core)
    {
        core.Settings.AreHostObjectsAllowed = false;
        core.Settings.IsWebMessageEnabled = false;
        core.Settings.AreDevToolsEnabled = testing;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsGeneralAutofillEnabled = false;
        core.NavigationStarting += (s, e) => { if (!SafeUrl(e.Uri)) e.Cancel = true; };
        core.DownloadStarting += (s, e) => e.Cancel = true;
        core.NewWindowRequested += OpenPopup;
        core.PermissionRequested += (s, e) => {
            // WebView2 presents its own permission UI; never silently grant devices.
            e.State = CoreWebView2PermissionState.Default;
            e.SavesInProfile = true;
        };
    }
    static bool SafeUrl(string value)
    {
        Uri uri; return Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == "https" && String.IsNullOrEmpty(uri.UserInfo);
    }
    async void OpenPopup(object sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (!SafeUrl(e.Uri) && e.Uri != "about:blank") return;
        var deferral = e.GetDeferral();
        Form popup = null;
        try {
            popup = new Form { Text = "Spotify · Nexus Hub", ShowInTaskbar = false, Size = new Size(560, 730), StartPosition = FormStartPosition.Manual };
            var point = PointToScreen(Point.Empty); popup.Location = point;
            var web = new WebView2 { Dock = DockStyle.Fill }; popup.Controls.Add(web);
            popups.Add(popup); popup.FormClosed += (s, args) => popups.Remove(popup);
            popup.Show(new WindowOwner(parent == IntPtr.Zero ? Handle : parent));
            await web.EnsureCoreWebView2Async(environment); Configure(web.CoreWebView2);
            web.CoreWebView2.WindowCloseRequested += (s, args) => popup.Close();
            e.NewWindow = web.CoreWebView2;
        } catch (Exception error) { if (popup != null) popup.Close(); Send(new { error = error.Message }); }
        finally { deferral.Complete(); }
    }
    sealed class WindowOwner : IWin32Window { public IntPtr Handle { get; private set; } public WindowOwner(IntPtr handle) { Handle = handle; } }
    void Place()
    {
        Rect size; double scale = parent != IntPtr.Zero && GetClientRect(parent, out size) ? size.Right / Math.Max(1, parentWidth) : 1;
        SetBounds((int)Math.Round(x * scale), (int)Math.Round(y * scale), Math.Max(1, (int)Math.Round(width * scale)), Math.Max(1, (int)Math.Round(height * scale)));
    }
    async void Dispatch(string line)
    {
        object id = null;
        try {
            var message = json.Deserialize<Dictionary<string, object>>(line); id = message["id"];
            string action = (string)message["action"];
            object result = true;
            if (action == "show") { wantedVisible = true; Place(); Show(); foreach (var popup in popups) popup.Show(); }
            else if (action == "hide") { wantedVisible = false; Hide(); foreach (var popup in popups) popup.Hide(); }
            else if (action == "bounds") {
                var bounds = (Dictionary<string, object>)message["value"];
                x = Convert.ToDouble(bounds["x"]); y = Convert.ToDouble(bounds["y"]);
                width = Convert.ToDouble(bounds["width"]); height = Convert.ToDouble(bounds["height"]); parentWidth = Convert.ToDouble(bounds["parentWidth"]); Place();
            }
            else if (action == "reload") { browser.CoreWebView2.Reload(); if (wantedVisible) Show(); }
            else if (action == "back") { if (browser.CoreWebView2.CanGoBack) browser.CoreWebView2.GoBack(); }
            else if (action == "logout") { await browser.CoreWebView2.Profile.ClearBrowsingDataAsync(); browser.CoreWebView2.Navigate("https://open.spotify.com/"); }
            else if (action == "diagnostics" && testing) {
                result = await browser.CoreWebView2.ExecuteScriptAsync("(()=>{if(window.__nexusDrm===undefined){window.__nexusDrm='pending';navigator.requestMediaKeySystemAccess('com.widevine.alpha',[{initDataTypes:['cenc'],audioCapabilities:[{contentType:'audio/mp4;codecs=\"mp4a.40.2\"'}]}]).then(()=>window.__nexusDrm=true,e=>window.__nexusDrm=e.message)}return {title:document.title,body:document.body.innerText.slice(0,4000),drm:window.__nexusDrm}})()");
            }
            else if (action == "window-state" && testing) {
                result = new { visible = Visible, parent = GetParent(Handle).ToInt64().ToString(), x = Left, y = Top, width = Width, height = Height, profile = profile };
            }
            else if (action == "quit") { Close(); }
            else throw new InvalidOperationException("Onbekende appactie.");
            Send(new { id = id, result = result });
        } catch (Exception error) { Send(new { id = id, error = error.Message }); }
    }
}
