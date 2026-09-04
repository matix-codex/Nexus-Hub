# Nexus Hub

Een Windows-dashboard voor je tweede scherm met games, Windows-apps, hardwaremetingen, RGB en internetradio. Gebouwd met Electron, React en lokale Windows-bridges. Geen Nexus-account nodig.

## Installeren

Download **Nexus-Hub-Setup-1.1.0.exe** via de [nieuwste GitHub-release](https://github.com/matix-codex/Nexus-Hub/releases/latest). Vereist Windows 10/11 x64. Node.js is niet nodig voor de geïnstalleerde app.

Kies in **Instellingen** je extra beeldscherm en schakel **Volledig scherm** in. Nexus bewaart de keuze, ook na herstart en voor de compacte overlay. Als het scherm wordt losgekoppeld, wacht Nexus verborgen op datzelfde scherm. Via **Vast scherm** in het systeemvak kun je een ander scherm kiezen.

Nexus verschijnt alleen in het systeemvak, zonder taakbalkknop of vensterknoppen rechtsboven. Dubbelklik op het systeemvakpictogram om Nexus te tonen. Afsluiten kan via het systeemvak of Instellingen.

| Sneltoets | Actie |
| --- | --- |
| Ctrl+Shift+Space | Nexus tonen/verbergen |
| Ctrl+Shift+O | Compacte overlay |
| F11 / Escape | Fullscreen wisselen / verlaten vanuit Nexus |
| Ctrl+K | Zoeken vanuit Nexus |

## Games en hoezen

- Lokale detectie van Steam-, Epic-, Xbox-, EA-, Rockstar-, Ubisoft-, Battle.net- en GOG-games, met platformfilters, favorieten, recent gestart en raster/lijst.
- Hoezen staan standaard aan. Nexus gebruikt eerst de lokale Steam-cache en daarna Steam-afbeeldingen. Games uit andere winkels worden op exacte titel gematcht. Afbeeldingen worden lokaal bewaard voor offline gebruik.
- Via **Hoes kiezen** op een gamekaart kun je een eigen JPG, PNG of WebP gebruiken. Geen exacte match betekent dat je zelf een afbeelding kiest; Nexus raadt geen andere editie.
- Niet-herkende games voeg je toe via EXE/LNK/URL of Windows-app. Online aankopen die niet zijn geïnstalleerd worden niet uit winkelaccounts opgehaald. Launchers verzorgen updates, DRM en aanmelding.

## Echte Windows-apps

**WhatsApp, Discord en Spotify gebruiken de geïnstalleerde Windows-app.** Er wordt voor deze drie apps geen webpagina of WebView2-speler geopend. Hun bestaande aanmelding, gesprekken, voice- en muziekfuncties blijven in de oorspronkelijke app.

Nexus plaatst het native appvenster op het geselecteerde scherm, boven de app-ruimte in Nexus. Tijdens beheer verdwijnt dat venster uit de taakbalk. Bij paginawisseling wordt het verborgen; audio en gesprekken blijven doorlopen. Bij afsluiten zet Nexus de oorspronkelijke vensterpositie en taakbalkstijl terug. **Los openen** geeft het venster terug aan Windows.

De apps behouden hun eigen proces en eventuele eigen titelbalk. Dit is vensterbeheer, geen aangepaste kopie van hun interface. Minimale venstergrootte, app-updates, afzonderlijke pop-ups en verschillen in beheerdersrechten kunnen de plaatsing beperken. Bij een fout biedt Nexus opnieuw plaatsen en los openen aan. Nexus leest geen wachtwoorden, tokens of chatgeschiedenis. Aanmelden en uitloggen doe je in de Windows-app.

Xbox opent de Xbox-desktopapp; Cloud Gaming kan in de browser worden geopend. Eigen HTTPS-webwidgets blijven in afzonderlijke sandboxvensters zonder Node-toegang of Nexus-preload.

## Systeemprestaties

De dashboardwidget toont CPU, GPU en RAM. **Alle sensoren** opent het hardwareoverzicht:

| Bron | Beschikbare gegevens |
| --- | --- |
| Windows / systeminformation | CPU, threads, kloksnelheid, RAM-modules, moederbord, schijven en netwerkinterfaces |
| NVIDIA NVML / nvidia-smi | Meerdere GPU’s, belasting, temperatuur, ventilatorpercentage, vermogen, vermogenslimiet, GPU/geheugenklok en VRAM |
| Windows GPU-tellers | Belasting per 3D/copy/video-engine, dedicated en shared geheugen, afhankelijk van de driver |
| LibreHardwareMonitor / OpenHardwareMonitor | Extra temperaturen, RPM, spanningen, vermogen en overige WMI-sensoren wanneer de betreffende app draait |

Het scherm toont de verbindingsstatus van elke bron en de laatste meettijd. Ontbrekende waarden verschijnen als **—**, geen verzonnen nul. Voor aanvullende CPU- en moederbordsensoren moet een ondersteunde monitorapp met WMI draaien. Nexus installeert geen kernel- of SMBus-driver en wijzigt geen beveiligingsinstellingen.

## Centrale RGB-bediening

Open **RGB-verlichting**, selecteer apparaten/zones, kies kleur en helderheid en druk op **Toepassen**. **Verlichting uit** stuurt zwart naar de selectie. Resultaten en fouten verschijnen per apparaat.

- **Corsair iCUE:** directe SDK-koppeling voor statische verlichting. iCUE moet draaien en software-integraties toestaan. Nexus zoekt de SDK in de geïnstalleerde iCUE- en GIGABYTE-integraties. Een ontbrekende SDK wordt gemeld.
- **MSI Center / Mystic Light:** directe Mystic Light SDK-adapter. Mystic Light en zijn service moeten beschikbaar zijn. **Officiële MSI SDK ophalen** downloadt SDK 1.0.0.08 rechtstreeks bij MSI en controleert de SHA-256 van archief en DLL. De SDK blijft lokaal; fabrikant-DLL’s worden niet in de GitHub-broncode of installer gekopieerd.
- **GIGABYTE / OpenRGB:** compatibele apparaten lopen via de lokale OpenRGB SDK-server op 127.0.0.1:6742. Installeer [OpenRGB](https://openrgb.org/), controleer ondersteuning voor je model en zet de SDK-server aan. Nexus ondersteunt Direct-modus. Dit is geen directe universele API voor alle GIGABYTE Control Center-functies.

Gebruik per fysiek apparaat één RGB-controller om conflicten te voorkomen. Nexus schakelt geen fabrikantservices uit en past bij opstarten geen verlichting toe. Een aangesloten fabrikantapp garandeert niet dat elk apparaat aan zijn SDK wordt vrijgegeven.

Op de ontwikkelpc zijn K70 RGB MK.2, M65 PRO RGB en MM700 RGB via iCUE gedetecteerd. De MSI-SDK geeft daar momenteel geen tijdig antwoord; OpenRGB is niet actief. Die bronnen worden daarom niet als werkend gerapporteerd.

## Internetradio

De radiomodule en optionele radiowidget bieden zoeken op zender, land en genre via Radio Browser, lokale favorieten en eigen directe http(s)-streamadressen. MP3, AAC en ondersteunde OGG/Opus/FLAC-streams spelen binnen Nexus. HLS en M3U/PLS-afspeellijsten worden niet aangeboden.

De speler blijft actief bij paginawisseling en heeft eigen volume- en mediaknoppen. Geen automatisch afspelen bij opstarten. Catalogus- en streamfouten worden getoond; opgeslagen favorieten blijven onafhankelijk van de catalogus bereikbaar. Een zender kan zijn streamadres of beschikbaarheid wijzigen.

## Gegevens en overige functies

Verplaatsbare widgets, brede/normale tegels, drie profielen en thema’s, notities, focustimer, Windows-audio/microfoonbediening, Windows-mediasessies en indeling importeren/exporteren blijven beschikbaar. De overlay werkt het best met borderless/windowed games; Nexus injecteert geen code in games.

Instellingen, favorieten, notities en timer staan in %APPDATA%/nexus-hub/nexus.json, de gamecache in library.json, hoezen in covers/ en een eventueel opgehaalde MSI-SDK in rgb-sdk/. De installer behoudt deze gegevens. Een indelingsexport bevat vormgeving en webwidgetadressen, geen accounts of notities.

Nexus heeft geen telemetrie, cloudbackend of luisterende netwerkserver. Externe catalogi, radiozenders en apps ontvangen de normale netwerkverzoeken die voor hun functies nodig zijn. Windows-helpers draaien onder de huidige gebruiker en stoppen met Nexus. Er wordt geen permanente Windows-service aangemaakt. Starten met Windows is optioneel.

De installer heeft geen uitgeverscertificaat. De release bevat een SHA-256-bestand om de download te controleren.

## Ontwikkelen en testen

Vereist Node.js 22.12+ of 24+, Windows PowerShell 5.1 en .NET Framework 4.8. C#-bridges worden met de Windows Framework-compiler gebouwd; WebView2 is niet meer nodig voor de drie Windows-apps.

1. npm ci
2. npm run dev
3. npm test
4. npm run build:native && npm run build
5. npm run test:desktop
6. node scripts/update-smoke.mjs
7. node scripts/features-smoke.mjs (NEXUS_TEST_NATIVE=1 activeert de native-appcontroles)
8. npm run dist

dev:web toont een browserpreview zonder verzonnen hardwaregegevens. Tests gebruiken een afzonderlijk gegevensprofiel. De featuretest is bedoeld voor de lokale pc met geïnstalleerde apps en games; radioweergave wordt op nul volume gecontroleerd. CI draait de overdraagbare unittests en bouwt de installer.

In 1.1.0 lokaal gecontroleerd: echte gamehoezen, RTX 2070-telemetrie, GPU-tellers, radio die audio decodeert, favorieten en doorlopende radio bij navigatie; vensterbeheer voor WhatsApp, Discord en Spotify; schermkeuze na loskoppelen en herstart. Gesprekken versturen, bellen en accountwijzigingen maken geen deel uit van de test.
