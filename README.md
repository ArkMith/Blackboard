# Blackboard

> Infinite visual workspace for planning, designing, organizing, and connecting ideas.

![License](https://img.shields.io/badge/License-GPLv3-blue.svg)

---

## Overview

Blackboard is an open-source infinite canvas application built for creative thinking and project organization.

Unlike traditional whiteboard applications, Blackboard is designed to become a complete visual workspace where ideas, assets, documents, timelines, and workflows can exist together on one limitless canvas.

Whether you're planning a game, designing software architecture, organizing research, or brainstorming ideas, Blackboard aims to provide a fast and distraction-free environment.

---

## Current Features

- Infinite canvas
- Visual node editor
- Card nodes
- Sticky notes
- Frame containers
- Image cards
- Asset pipeline nodes
- Timeline nodes
- Freehand drawing
- Eraser
- Undo / Redo
- Zoom & Pan
- Mini Map
- Local project saving
- Touch support
- Dark / Light themes

---

## Planned Features

- Plugin System
- Markdown Notes
- Embedded Documents
- Audio & Video Assets
- Mind Maps
- Tables
- Flow Charts
- Database Views
- Presentation Mode
- Multiplayer Collaboration
- Template Library
- Asset Browser
- Export to PDF
- SVG Export
- Infinite Undo History
- Workspace Search
- Custom Themes
- Custom Brushes

---

## Philosophy

Blackboard follows a few simple principles.

- Local-first
- Fast
- Lightweight
- Privacy respecting
- No required account
- No telemetry
- Open source
- Community driven

Your projects belong to you.

---

## Project Format

Projects are stored using the native Blackboard project format.

```
blackboard.data.json at %APPDATA%\Roaming\com.arkmith.blackboard
```

The project file contains everything required to reopen a workspace, including:

- Objects
- Connections
- Drawings
- Assets
- Metadata
- Project Settings

No cloud service is required. 

---

## Technology

- Tauri
- React
- TypeScript
- React Flow
- Zustand
- Tailwind CSS
- Vite

---

## Building

Clone the repository.

```bash
git clone https://github.com/arkmith/blackboard.git
```

Install dependencies.

```bash
npm install
```

Run development mode.

```bash
npm run tauri dev
```

Create a production build.

```bash
npm run tauri build
```

---

## Contributing

Contributions are welcome.

If you'd like to improve Blackboard:

1. Fork the repository.
2. Create a feature branch.
3. Commit your changes.
4. Submit a Pull Request.

Please try to keep pull requests focused on a single feature or fix.

---

## Roadmap

Current development priorities include:

- Stable local project system
- Asset management
- Workspace serialization
- Plugin API
- Performance optimization
- Presentation mode
- Documentation

---

## License

Blackboard is free software licensed under the **GNU General Public License v3.0 or later (GPL-3.0-or-later).**

You may:

- Use Blackboard for any purpose.
- Study how it works.
- Modify the source code.
- Share copies.
- Distribute modified versions under the GPL.

See the LICENSE file for the complete license.

---

## Copyright

Copyright © 2026 Arkmith

Blackboard is free software released under the GNU General Public License Version 3 or later.

---

## Acknowledgements

Blackboard is built using several excellent open-source projects, including:

- Tauri
- React
- React Flow
- Zustand
- Tailwind CSS
- Lucide Icons
- Vite

Thanks to the maintainers and contributors of these projects.

---

Made with ❤️ by Arkmith