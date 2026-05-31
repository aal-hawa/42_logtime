# 42 Logtime Tracker

A Chrome extension that tracks your monthly logtime directly from 42 Intra — no OAuth needed!

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.1.0-green.svg)

## Features

- **Real-time logtime tracking** - Fetches data directly from 42 Intra
- **Monthly progress visualization** - Circular progress ring showing monthly goal progress
- **Detailed statistics**:
  - Current month: hours done, remaining, daily average, days left, best day
  - Previous month: total hours, daily average, active days, goal percentage
  - Weekly view with daily breakdown
  - Last 14 days history
- **Heatmap visualization** - Visual representation of daily logtime
- **Customizable settings**:
  - Monthly goal hours
  - Available days of the week
  - Active day threshold
- **No authentication required** - Uses your existing 42 Intra login session
- **Offline support** - Settings and recent data persist locally

## Screenshots

### Main Dashboard
![Dashboard](https://i.imgur.com/example1.png) *Main dashboard showing monthly progress and statistics*

### Settings Panel
![Settings](https://i.imgur.com/example2.png) *Customizable goals and availability settings*

## Installation

1. **Download the extension**
   - Clone this repository: `git clone https://github.com/yourusername/42_countup.git`
   - Or download the ZIP file and extract it

2. **Install in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked"
   - Select the extension folder

3. **Open 42 Intra**
   - Navigate to `https://profile.intra.42.fr` in a tab
   - Make sure you're logged in to your 42 account

## Usage

1. **Open the extension**
   - Click the extension icon in your Chrome toolbar
   - The extension will automatically detect if you're on 42 Intra

2. **View your logtime**
   - Current month progress with circular progress ring
   - Previous month statistics
   - Weekly overview
   - Last 14 days breakdown

3. **Customize settings**
   - Click the settings icon (⚙) in the extension
   - Set your monthly goal hours
   - Select which days you're available to log hours
   - Set the minimum hours for an "active day"
   - Click "Save Settings"

## How It Works

The extension works by:

1. **Detecting your 42 Intra session** - It looks for an active tab with 42 Intra
2. **Extracting your login information** - Parses the page to get your username
3. **Fetching logtime data** - Makes API calls to 42 Intra's translate service
4. **Calculating statistics** - Processes the data to show meaningful insights
5. **Visualizing the data** - Presents information through charts and heatmaps

## Privacy & Security

- **No OAuth required** - Uses your existing 42 Intra login session
- **Data stays local** - All data is processed in your browser
- **No external servers** - No data is sent to third-party servers
- **Secure permissions** - Only requests necessary Chrome permissions

## Development

### Files Structure

```
42_countup/
├── manifest.json          # Extension manifest
├── popup.html           # Extension popup HTML
├── popup.js             # Extension logic
├── popup.css            # Extension styles
├── background.js        # Background service worker
├── content.js           # Content script (if needed)
└── icons/               # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Building

This is a simple Chrome extension that doesn't require a build process. Just load the folder directly in Chrome's developer mode.

### Testing

1. Load the extension in Chrome developer mode
2. Open `https://profile.intra.42.fr` and log in
3. Click the extension icon to test functionality
4. Check the debug panel for any issues

## Troubleshooting

### Extension not working
- Make sure you're on 42 Intra (`profile.intra.42.fr` or `profile-v3.intra.42.fr`)
- Check that you're logged in to your 42 account
- Try clicking the "Retry" button in the extension

### Data not loading
- Refresh the 42 Intra page
- Restart the extension
- Check the debug panel for error messages

### Settings not saving
- Make sure you're clicking "Save Settings"
- Check browser permissions for the extension

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit your changes: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin feature/new-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:
1. Check the troubleshooting section
2. Look at existing issues on GitHub
3. Create a new issue with detailed description

---

Made with ❤️ for the 42 community