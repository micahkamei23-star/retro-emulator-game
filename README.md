# Retro Emulator Game

## Overview
The Retro Emulator Game project is a Progressive Web App (PWA) designed to emulate classic video games from various platforms on iPhone and other devices. This project provides a seamless gaming experience without the need for native installations.

## Key Features
- **Multi-System Support:** NES, SNES, Game Boy, Game Boy Advance emulation
- **Offline Gameplay:** Play games without an internet connection after initial install
- **Local ROM Storage:** Store ROM files locally on your device using IndexedDB
- **Save/Load Game States:** Save your progress and continue later with persistent storage
- **Touch Controls:** On-screen touch controller optimized for iPhone
- **Bluetooth Support:** Connect Bluetooth game controllers for enhanced gameplay
- **iPhone Installation:** Add to home screen as a standalone web app
- **Retro UI:** Authentic 8-bit style interface with pixel art styling

## Supported Systems
- NES (Nintendo Entertainment System)
- SNES (Super Nintendo Entertainment System)
- Game Boy
- Game Boy Advance

## Tech Stack
- **HTML5** - Markup structure
- **CSS3** - Styling and responsive design
- **JavaScript** - Core application logic
- **WebAssembly** - Emulator cores for high-performance emulation
- **Service Workers** - Offline support and caching
- **IndexedDB** - Local ROM and save data storage
- **Gamepad API** - Bluetooth controller support

## Installation on iPhone
1. Open this PWA in Safari on your iPhone
2. Tap the Share button
3. Select "Add to Home Screen"
4. Name the app and tap "Add"
5. The app will now be available on your home screen like a native app

## Project Structure
```
retro-emulator-game/
├── index.html              # Main PWA shell
├── manifest.json           # PWA metadata
├── service-worker.js       # Offline support
├── css/
│   └── styles.css         # Retro-style UI
├── js/
│   ├── main.js            # Core application logic
│   ├── emulator-loader.js # WebAssembly loader
│   ├── controller.js      # Touch & Bluetooth controls
│   └── storage.js         # Local storage management
└── README.md
```

## Getting Started

### Prerequisites
- Modern web browser with WebAssembly support
- iPhone/iOS device for best experience

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/micahkamei23-star/retro-emulator-game.git
   cd retro-emulator-game
   ```

2. Serve locally (for development):
   ```bash
   python -m http.server 8000
   ```
   Then visit `http://localhost:8000`

3. Or deploy to a web host for production use

## Usage
- **Load ROM:** Use the file picker to select a ROM file from your device
- **Play:** Use touch controls or connect a Bluetooth controller
- **Save:** Game state is automatically saved to local storage
- **Load:** Previously saved games appear in the menu

## File Formats Supported
- `.nes` - NES ROMs
- `.smc`, `.sfc` - SNES ROMs
- `.gb` - Game Boy ROMs
- `.gba` - Game Boy Advance ROMs

## Browser Compatibility
- Chrome/Chromium 57+
- Firefox 52+
- Safari 11.1+ (iOS 11.3+)
- Edge 79+

## Controls

### Touch Controller
- **D-Pad:** Navigate
- **Action Buttons:** A, B, X, Y (varies by system)
- **Start/Select:** Menu buttons

### Bluetooth Controller
- Compatible with most standard game controllers
- Automatic mapping to emulator button layouts

## Contributing
Contributions are welcome! Please follow these steps:
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/YourFeatureName`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push to the branch: `git push origin feature/YourFeatureName`
5. Open a Pull Request

## Known Issues & Limitations
- Some ROM formats may not be fully compatible
- Performance varies based on device hardware
- WebAssembly cores must be separately added to `wasm/` directory

## Roadmap
- [ ] Add Sega Genesis emulation
- [ ] Implement ROM browser/search
- [ ] Add online multiplayer support
- [ ] Create dedicated iOS app

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments
- WebAssembly emulator cores from the RetroArch project
- Inspiration from classic gaming experiences
- Community contributions and feedback

## Contact & Support
For questions, bug reports, or feature requests, please:
- Open an issue on GitHub
- Contact: micahkamei23@gmail.com

---

**Last Updated:** 2026-03-15 05:19:35
**Version:** 1.0.0