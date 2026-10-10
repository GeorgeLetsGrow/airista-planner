AiRISTA Planner is a lightweight, shared work-planning web app for coordinating projects, tasks, deadlines, and team capacity.
It allows team members to:
- Organize work into cards and update their status
- Assign owners, dates, priorities, and other planning details
- Track available hours and key counters
- Add comments and review each card’s change history
- See updates made by other users, with open tabs refreshing automatically
- Export the complete plan as a JSON backup
The application is hosted on Netlify. Its frontend is a simple browser-based interface, while a Netlify Function stores shared data in Netlify Blobs. Changes are submitted as small operations, which helps prevent people editing different fields from accidentally overwriting each other.
