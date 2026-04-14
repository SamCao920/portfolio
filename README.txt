1. Alternative Design Approaches (Without Cards)
Before diving into the code, let's discuss some alternative ways to display your portfolio instead of the "grid of cards" layout. Since you want a modern, minimalist look, here are a few elegant structures:

The Minimalist Timeline / List View (Implemented Below): Instead of boxed cards, your experiences are presented as a clean, continuous list with subtle dividing lines. The left side can show the category or date, and the right side contains the description. It reads more like a highly polished, interactive resume.

The Accordion Design: You only see a list of titles and roles. When a user clicks on one (e.g., "Harvard International Economics Essay Contest"), it slides open to reveal the description underneath. This is the ultimate minimalist approach as it hides text until the user specifically asks for it.

Split-Screen / Sticky Sidebar: The left half of the screen stays fixed in place, showing your name, navigation, and contact info. The right half of the screen contains all your experiences, allowing the user to scroll through them independently.

A Multi-Page Architecture: Instead of putting everything on one long scrolling page, the website is split into separate HTML files: index.html (just a brief intro and your name), portfolio.html (your essays and projects), and about.html (your bio).

Note on Multi-page: While highly professional, multi-page sites can be slightly more tedious to host and maintain if you are just starting out, as you have to manage multiple files. A "Single-Page Application" (SPA) style that mimics multiple pages by scrolling smoothly is generally preferred for personal portfolios today, but I have adjusted the design below to feel much cleaner and less cluttered than the card grid.