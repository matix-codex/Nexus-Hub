# Nexus Hub

Een zelfstandig Windows-dashboard voor je tweede scherm, geïnspireerd door Xenon, Xbox Game Bar, Rainmeter en Overwolf. Gebouwd met Electron, React en een lokale Windows-bridge. Geen Nexus-account nodig.

## Starten

- **Download:** [nieuwste Windows-installer op GitHub](https://github.com/matix-codex/Nexus-Hub/releases/latest). Kies het bestand `Nexus-Hub-Setup-1.0.2.exe` bij Assets.
- **Installeren:** open `release/Nexus-Hub-Setup-1.0.2.exe`. De installer maakt een snelkoppeling aan en installeert WebView2 via Microsoft wanneer de runtime ontbreekt (internet nodig).
- **Direct uitvoeren:** open `release/1.0.2/win-unpacked/Nexus Hub.exe`. Laat de overige bestanden in die map staan.
- Open **Instellingen**, kies je extra scherm en schakel **Volledig scherm** in. Nexus bewaart je schermkeuze.
- **F11:** wissel fullscreen. **Escape:** terug naar venstermodus.
- **Ctrl+Shift+Space:** toon/verberg Nexus. **Ctrl+Shift+O:** compacte overlay.
- Nexus verschijnt alleen in het systeemvak. De knoppen voor minimaliseren, fullscreen en sluiten zijn uit de bovenbalk verwijderd. Dubbelklik op het systeemvakpictogram om Nexus te openen. Afsluiten kan via het systeemvak of Instellingen.
- De gekozen monitor blijft vastgelegd, ook voor de overlay. Bij loskoppelen wacht Nexus verborgen totdat hetzelfde scherm terugkomt. Je kunt via het systeemvak onder **Vast scherm** zelf een ander aangesloten scherm kiezen. Nexus springt niet naar het scherm bij de muis.

## Functies

| Onderdeel | Werking |
| --- | --- |
| Dashboard | Verplaatsbare widgets, normale/brede tegels, eigen HTTPS-webwidgets, drie profielen, drie thema’s, compacte weergave en indeling importeren/exporteren. |
| Extra scherm | Native fullscreen op een gekozen monitor, schermherstel na loskoppelen, optioneel altijd bovenop en starten met Windows. Standaardindeling past op 2560×720. |
| Gamebibliotheek | Lokale detectie, zoeken, filters per platform, favorieten, laatst gestart, raster/lijst en handmatig toevoegen van EXE/LNK/URL of Windows-apps. |
| Steam | Bibliotheekmappen en ACF-manifesten, starten via Steam, optionele officiële coverafbeeldingen. |
| Epic | Geïnstalleerde games uit Epic-manifesten, starten via Epic. |
| Xbox | Geïnstalleerde MicrosoftGame.config-pakketten detecteren en starten via de Windows-app-ID. Andere Windows-games kunnen handmatig worden toegevoegd. |
| EA, Rockstar, Ubisoft, Battle.net, GOG | Herkenning via installatieregisters en beschikbare uitvoerbare bestanden. Bij onduidelijke installaties kies je zelf het gamebestand. GOG-registervermeldingen met een game-executable worden ondersteund. |
| Discord | Geïsoleerd ingebouwd Discord-webvenster, eigen login, chats en web-voicefuncties. Microfoon/camera vereisen toestemming in de app. |
| WhatsApp | Geïsoleerd ingebouwd WhatsApp Web. Zelf koppelen via de QR-code. Functies volgen wat WhatsApp Web ondersteunt. |
| Spotify | Eigen ingebouwde Windows WebView2-app met een afzonderlijk lokaal profiel. De webspeler opent rechtstreeks binnen Nexus en blijft actief bij wisselen van pagina. De Now playing-widget bedient beschikbare Windows-mediasessies. |
| Xbox online | Snel toegang tot de Xbox-desktopapp en Cloud Gaming in de gewone browser. Party’s, vrienden en accountfuncties worden door Xbox verzorgd. |
| Audio | Echte Windows-volumeregeling, uitvoermute en mute van de standaardcommunicatiemicrofoon. |
| Monitoring | CPU, RAM, netwerkdoorvoer, klok en uptime. NVIDIA-gebruik en temperatuur via nvidia-smi als beschikbaar. Ontbrekende sensoren worden als niet beschikbaar getoond. |
| Productiviteit | Automatisch opgeslagen notities en een focustimer die na herstart zijn resterende tijd bewaart, met Windows-melding bij voltooiing. |

De overlay is een normaal native venster boven andere vensters. Bij games in exclusieve fullscreen kan dat venster niet worden gegarandeerd; borderless/windowed werkt hiervoor beter. Nexus injecteert geen code in games en bevat geen anti-cheat-hooks, FPS-capture, schermopname of kopie van alle functies uit de inspiratieprogramma’s.

“Alle games” betekent één bibliotheek voor de lokaal gevonden en handmatig toegevoegde games. Niet-geïnstalleerde aankopen uit online winkelaccounts worden niet automatisch opgehaald. Startverzoeken worden aan de bijbehorende game/client doorgegeven; updates, DRM of login kunnen vervolgens door die client worden gevraagd. Launchers moeten geïnstalleerd zijn. Er zijn geen verzonnen vriendenlijsten, chatberichten, hardwaremetingen of games.

## Accounts en gegevens

Je logt zelf in bij Discord en Spotify en koppelt zelf WhatsApp. Elke app heeft een eigen lokale sessie in Nexus. Discord en WhatsApp bewaren bestaande Electron-profielen; Spotify gebruikt de Windows WebView2-runtime met een eigen profiel in `apps/spotify` onder de Nexus-gegevensmap. Aanmeldvensters gebruiken dezelfde sessie en blijven bij Nexus. De drie apps openen standaard intern, zonder aparte desktopclient of browsertab.

Dit zijn de officiële webapps in een eigen lokale appomgeving; de diensten blijven internet en een eigen account vereisen. Functies volgen de mogelijkheden van de betreffende webapp. Er worden geen accounts of tokens uit geïnstalleerde apps overgenomen. Externe pagina’s krijgen geen Node-toegang, native preload, hostobjecten of Nexus-IPC.

Getest in 1.0.2: de aanmeldpagina’s van alle drie de apps laden, Spotify is een echt kindvenster van Nexus, de Widevine-audio-interface is beschikbaar, appvensters verdwijnen voor Nexus-dialogen en de schermkeuze overleeft loskoppelen en herstarten. Muziekweergave na Spotify-login, gesprekken en voice zijn zonder jouw account niet end-to-end getest.

Nexus-instellingen, favorieten, timer en notities staan in `%APPDATA%/nexus-hub/nexus.json`; de gamecache staat ernaast in `library.json`. De installer gebruikt dezelfde appgegevens. Een indelingsexport bevat alleen vormgeving en webwidgetadressen, geen accounts of notities. Gamecovers staan standaard uit en zijn optioneel in Instellingen. Er is geen telemetrie, cloudbackend of luisterende netwerkserver in de gebouwde app.

De Windows-helper draait als gewone gebruiker en ontvangt alleen begrensde opdrachten voor audio en media. Hij wordt bij afsluiten gestopt. Er wordt geen permanente Windows-taak of service aangemaakt. Starten met Windows gebeurt alleen als je dit in Instellingen inschakelt.

De meegeleverde installer is een lokale, niet met een uitgeverscertificaat ondertekende build.

## Ontwikkelen

Vereist Node.js 22.12+ of 24+ en Windows 10/11 x64 met Windows PowerShell 5.1 en .NET Framework 4.8. De distributie bevat Electron en vereist geen losse Node-installatie. `build:native` bouwt de C#-apphost met de Windows Framework-compiler en de vastgelegde officiële WebView2 SDK. De meegeleverde Microsoft-bootstrapper wordt op uitgevershandtekening gecontroleerd.

```powershell
npm ci
npm run dev
```

```powershell
npm test               # Detectie, bestandsparsing, validatie en opslag
npm run build:native   # Windows WebView2-apphost
npm run build          # Productie-interface
npm run test:desktop   # Echte Electron/Windows-integratietest, geïsoleerd profiel
npm run dist           # Windows-installer + direct uitvoerbare map
```

`npm run dev:web` biedt een browserpreview zonder Windows-functies. Deze preview toont geen gesimuleerde hardware- of gamegegevens.

## Structuur

- `src/`: dashboard, widgets, bibliotheek, apps en instellingen.
- `electron/`: vensters, afgeschermde IPC, sessies, gameherkenning, opslag en bridgebeheer.
- `native/`: PowerShell-protocol, Windows-media, C# Core Audio en WebView2-apphost.
- `tests/`: gerichte tests met tijdelijke game-installaties.
- `scripts/smoke.mjs`: Electron-integratiecontrole en screenshots in `artifacts/`.

De vormgeving is een eigen implementatie. Er is geen broncode uit Xenon overgenomen. Referentie: https://xenon-app.com/. Native webvensters volgen https://www.electronjs.org/docs/latest/api/web-contents-view en https://www.electronjs.org/docs/latest/tutorial/security.



