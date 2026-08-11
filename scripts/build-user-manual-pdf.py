#!/usr/bin/env python3
"""Build the LINOS Hotel user manual PDF with screenshots."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REPO_SHOTS = ROOT / "docs" / "manual" / "screenshots"
ARTIFACT_SHOTS = Path("/opt/cursor/artifacts/manual/screenshots")
SHOTS = REPO_SHOTS if REPO_SHOTS.exists() else ARTIFACT_SHOTS
OUT_DIR = Path("/opt/cursor/artifacts/manual")
OUT_PDF = OUT_DIR / "LINOS-Hotel-User-Manual.pdf"
REPO_COPY = ROOT / "docs" / "LINOS-Hotel-User-Manual.pdf"

FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
FONT_SERIF_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

BRAND = (11, 79, 108)
INK = (28, 35, 41)
MUTED = (90, 104, 114)
LINE = (210, 220, 226)
SOFT = (238, 246, 250)
OK = (31, 122, 76)


class ManualPDF(FPDF):
    def __init__(self) -> None:
        super().__init__(format="A4", unit="mm")
        self.set_auto_page_break(auto=True, margin=18)
        self.add_font("Body", "", FONT_REG)
        self.add_font("Body", "B", FONT_BOLD)
        self.add_font("Display", "", FONT_SERIF)
        self.add_font("Display", "B", FONT_SERIF_BOLD)
        self.section_no = 0

    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("Body", "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 8, "LINOS Hotel · User Manual", align="L")
        self.set_xy(self.l_margin, 10)
        self.cell(0, 8, "Masaero", align="R")
        self.set_draw_color(*LINE)
        self.line(self.l_margin, 16, self.w - self.r_margin, 16)
        self.ln(10)

    def footer(self) -> None:
        if self.page_no() == 1:
            return
        self.set_y(-14)
        self.set_draw_color(*LINE)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.set_y(-12)
        self.set_font("Body", "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 8, f"Page {self.page_no() - 1}", align="C")

    def cover(self) -> None:
        self.add_page()
        self.set_fill_color(*BRAND)
        self.rect(0, 0, self.w, 92, "F")
        self.set_y(36)
        self.set_text_color(255, 255, 255)
        self.set_font("Display", "B", 28)
        self.multi_cell(0, 12, "LINOS Hotel", align="C")
        self.set_font("Body", "", 14)
        self.ln(2)
        self.multi_cell(0, 8, "User Manual", align="C")
        self.ln(2)
        self.set_font("Body", "", 11)
        self.multi_cell(
            0,
            6,
            "Hotel linen operations for boutique hotels, spas, and hospitality teams",
            align="C",
        )
        self.set_y(110)
        self.set_text_color(*INK)
        self.set_font("Body", "", 11)
        self.multi_cell(
            0,
            7,
            "This guide shows how to set up your property, run the morning board, "
            "assign rooms, and record linen service on the housekeeper screen. "
            "Screenshots are from the Masaero demo workspace and match the live product.",
        )
        self.ln(8)
        self.set_fill_color(*SOFT)
        self.set_draw_color(*LINE)
        box_y = self.get_y()
        self.rect(self.l_margin, box_y, self.epw, 48, "DF")
        self.set_xy(self.l_margin + 6, box_y + 6)
        self.set_font("Body", "B", 11)
        self.cell(0, 7, "Who this manual is for")
        self.ln(8)
        self.set_x(self.l_margin + 6)
        self.set_font("Body", "", 10)
        for line in [
            "• Superadmin / owner — Hotel setup and Admin",
            "• Supervisor — Morning board and Assignment",
            "• Housekeeper — My rooms and room service",
            "• Store / Porter — collection handoffs (Phase 2)",
        ]:
            self.set_x(self.l_margin + 6)
            self.cell(0, 6, line)
            self.ln(6)
        self.set_y(190)
        self.set_text_color(*MUTED)
        self.set_font("Body", "", 9)
        self.multi_cell(
            0,
            5,
            f"Edition {date.today().isoformat()}  ·  Demo screenshots are synthetic / approximate\n"
            "Product: Masaero LINOS Hotel",
            align="C",
        )

    def h1(self, title: str) -> None:
        self.section_no += 1
        if self.get_y() > 250:
            self.add_page()
        self.ln(2)
        self.set_x(self.l_margin)
        self.set_font("Display", "B", 16)
        self.set_text_color(*BRAND)
        self.multi_cell(self.epw, 9, f"{self.section_no}. {title}")
        self.set_draw_color(*BRAND)
        self.set_line_width(0.5)
        self.line(self.l_margin, self.get_y(), self.l_margin + 36, self.get_y())
        self.set_line_width(0.2)
        self.ln(4)
        self.set_text_color(*INK)
        self.set_x(self.l_margin)

    def h2(self, title: str) -> None:
        if self.get_y() > 255:
            self.add_page()
        self.set_x(self.l_margin)
        self.set_font("Body", "B", 12)
        self.set_text_color(*BRAND)
        self.multi_cell(self.epw, 7, title)
        self.ln(1)
        self.set_text_color(*INK)
        self.set_x(self.l_margin)

    def p(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_font("Body", "", 10)
        self.set_text_color(*INK)
        self.multi_cell(self.epw, 5.5, text)
        self.ln(2)

    def bullets(self, items: list[str]) -> None:
        self.set_font("Body", "", 10)
        self.set_text_color(*INK)
        for item in items:
            self.set_x(self.l_margin)
            self.multi_cell(self.epw, 5.5, f"•  {item}")
        self.ln(2)

    def tip(self, text: str) -> None:
        if self.get_y() > 250:
            self.add_page()
        y = self.get_y()
        self.set_font("Body", "", 9)
        tip_text = f"Tip: {text}"
        # Measure wrapped height without drawing.
        lines = self.multi_cell(self.epw - 8, 5, tip_text, dry_run=True, output="LINES")
        box_h = max(12.0, 6 + 5 * len(lines))
        self.set_fill_color(245, 250, 247)
        self.set_draw_color(180, 210, 190)
        self.rect(self.l_margin, y, self.epw, box_h, "DF")
        self.set_xy(self.l_margin + 4, y + 3)
        self.set_text_color(*OK)
        self.set_font("Body", "B", 9)
        self.cell(18, 5, "Tip:")
        self.set_text_color(*INK)
        self.set_font("Body", "", 9)
        self.multi_cell(self.epw - 26, 5, text)
        self.set_y(y + box_h + 3)
        self.set_x(self.l_margin)

    def shot(self, filename: str, caption: str) -> None:
        path = SHOTS / filename
        if not path.exists():
            self.p(f"[Screenshot missing: {filename}]")
            return
        with Image.open(path) as im:
            w_px, h_px = im.size
        max_w = self.epw
        max_h = 118
        aspect = h_px / w_px
        w = max_w
        h = w * aspect
        if h > max_h:
            h = max_h
            w = h / aspect
        need = h + 14
        if self.get_y() + need > self.h - 20:
            self.add_page()
        x = self.l_margin + (self.epw - w) / 2
        self.set_draw_color(*LINE)
        self.rect(x - 0.5, self.get_y() - 0.5, w + 1, h + 1)
        self.image(str(path), x=x, y=self.get_y(), w=w, h=h)
        self.ln(h + 2)
        self.set_font("Body", "", 8)
        self.set_text_color(*MUTED)
        self.multi_cell(0, 4.5, caption, align="C")
        self.ln(3)
        self.set_text_color(*INK)

    def role_table(self) -> None:
        rows = [
            ("Platform Superadmin", "All properties, Hotel setup, Admin"),
            ("Supervisor", "Morning board, Assignment, Verification"),
            ("Housekeeper", "My rooms — cart and room service"),
            ("Porter", "Room-to-store collections"),
            ("Store Agent", "Receive and reconcile collections"),
        ]
        self.set_font("Body", "B", 9)
        self.set_fill_color(*SOFT)
        self.set_text_color(*BRAND)
        self.cell(55, 8, "Role", border=1, fill=True)
        self.cell(self.epw - 55, 8, "Main screens", border=1, fill=True)
        self.ln()
        self.set_font("Body", "", 9)
        self.set_text_color(*INK)
        for role, screens in rows:
            self.cell(55, 7, role, border=1)
            self.cell(self.epw - 55, 7, screens, border=1)
            self.ln()
        self.ln(3)


def build() -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pdf = ManualPDF()

    pdf.cover()

    pdf.add_page()
    pdf.h1("Getting started")
    pdf.p(
        "LINOS Hotel tracks clean and soiled linen by room. Supervisors plan the day; "
        "housekeepers record what actually happened in each room; fitted standards "
        "(what belongs in a room type) stay separate from guest extras."
    )
    pdf.h2("Sign in")
    pdf.bullets(
        [
            "Open the LINOS Hotel web app on your phone, tablet, or computer.",
            "Use your work email and password for a live hotel workspace.",
            "Or open Try the demo workspace to explore with sample Masaero data (blank password).",
        ]
    )
    pdf.shot(
        "01-login.jpg",
        "Figure 1. Sign-in screen with demo accounts expanded.",
    )
    pdf.h2("Roles at a glance")
    pdf.role_table()
    pdf.tip(
        "Menu labels never authorize actions. The server checks your role and capabilities for every change."
    )

    pdf.h1("Hotel setup (Superadmin)")
    pdf.p(
        "Hotel setup is the one-time path to configure a property. The story is simple: "
        "room types → standard linen per type → rooms and exceptions → linen needs totals → go live."
    )
    pdf.bullets(
        [
            "Small properties use a short path: Your place → Rooms & exceptions → Team & laundry → Linen needs.",
            "Standard / large (and the Masaero demo) use the full rail shown below.",
            "You can amend anything later from Hotel setup or Admin.",
        ]
    )

    pdf.h2("Step A — How many room types?")
    pdf.p(
        "List each kind of room (Superior, Suite…) and the bed layouts you use "
        "(King, Twin). Apply starters if you are unsure, then edit names and codes."
    )
    pdf.shot(
        "02-setup-types.jpg",
        "Figure 2. Hotel setup — Room types and bed layouts.",
    )

    pdf.h2("Step B — Standard linen for each type")
    pdf.p(
        "For each room type, set the normal fitted set. Choose a type card, switch King / Twin, "
        "enter quantities, and save. Guest extras are added later on My rooms and never change this baseline."
    )
    pdf.shot(
        "03-setup-standards.jpg",
        "Figure 3. Hotel setup — Standard linen by room type.",
    )

    pdf.h2("Step C — Rooms and exceptions")
    pdf.p(
        "Create rooms with a default type and bed. Most rooms follow the type standard. "
        "If one room is different, use Make exception and amend its linen."
    )
    pdf.shot(
        "04-setup-rooms.jpg",
        "Figure 4. Hotel setup — Rooms list with Follows type / Exception.",
    )

    pdf.h2("Step D — Linen needs and go live")
    pdf.p(
        "The final step shows every linen type and the total fitted quantity across active rooms. "
        "Confirm when the summary looks right. You can still amend afterward."
    )
    pdf.shot(
        "05-setup-needs.jpg",
        "Figure 5. Hotel setup — Linen types and quantity required.",
    )

    pdf.h1("Dashboard")
    pdf.p(
        "The Dashboard is the operations overview: today’s progress, linen snapshot by room, "
        "and shortcuts into Morning board, Assignment, and Admin."
    )
    pdf.shot(
        "06-dashboard.jpg",
        "Figure 6. Operations Dashboard with room linen snapshot.",
    )
    pdf.tip(
        "On the linen snapshot, insufficient fitted stock shows red, normal green, and extra blue."
    )

    pdf.h1("Supervisor — Morning board")
    pdf.p(
        "Each morning the Supervisor confirms which rooms need linen service. "
        "The Morning board builds today’s round from occupancy decisions "
        "(checkout vs stayover). Vacant rooms stay off the list."
    )
    pdf.bullets(
        [
            "Review the board mix (checkout / stayover / DND / no-service).",
            "Make the round active for assignment when the list looks right.",
            "Occupied rooms begin as soiled / service required until a housekeeper submits.",
        ]
    )
    pdf.shot(
        "07-morning-board.jpg",
        "Figure 7. Supervisor Morning board.",
    )

    pdf.h1("Supervisor — Assignment")
    pdf.p(
        "Assignment splits today’s rooms across housekeepers. The system prefers each "
        "housekeeper’s default floor first, then balances remaining rooms evenly. "
        "Supervisors can amend after auto-assign."
    )
    pdf.shot(
        "08-assignment.jpg",
        "Figure 8. Assignment board — rooms per housekeeper.",
    )
    pdf.tip(
        "There is no minimum rooms-per-housekeeper rule. Adjust names on the board if someone swaps floors."
    )

    pdf.h1("Housekeeper — My rooms")
    pdf.p(
        "Housekeepers work from My rooms. Prepare the cart, open the next room, record the "
        "service result, and submit for Supervisor verification."
    )

    pdf.h2("Start of day")
    pdf.bullets(
        [
            "Check progress (rooms completed vs assigned).",
            "Prepare cart, then Issue cart before servicing.",
            "Open the first Assigned room and tap Start room.",
        ]
    )
    pdf.shot(
        "09-hk-home.jpg",
        "Figure 9. My rooms — progress, cart, and Start room.",
    )

    pdf.h2("Servicing a room")
    pdf.p("When a room is In progress, the usual path is:")
    pdf.bullets(
        [
            "✓ Matches standard — linen matches the fitted set for this room type.",
            "Submit room — send the record to your Supervisor.",
            "Add daily guest extras only when the guest needs them every day.",
            "Set Room result (changed, partial, DND, guest declined, etc.) and an optional note.",
        ]
    )
    pdf.shot(
        "10-hk-service.jpg",
        "Figure 10. Room in progress — Matches standard and Submit room.",
    )
    pdf.shot(
        "11-hk-result.jpg",
        "Figure 11. Guest extras, Room result, and My room list.",
    )
    pdf.h2("When something is wrong")
    pdf.bullets(
        [
            "Adjust counts manually — only if the room does not match the standard.",
            "Report a problem or take a photo — missing, damaged, stained, or other issues.",
            "After Submit, wait for Supervisor verification before the room is closed.",
        ]
    )
    pdf.tip(
        "Partial, DND, and not-changed outcomes stay visible for follow-up. A normal change clears the soiled state after submit."
    )

    pdf.h1("Admin")
    pdf.p(
        "Admin is day-to-day configuration after setup: room grid, fitted linen per room, "
        "default floors for housekeepers, and grow-this-property feature packs."
    )
    pdf.shot(
        "12-admin.jpg",
        "Figure 12. Admin — room grid and fitted linen by floor.",
    )
    pdf.bullets(
        [
            "Click a room to change its type or amend fitted include/qty.",
            "Guest extras stay on My rooms — they never inflate the fitted standard.",
            "Supervisors with configure rights can maintain floors and room settings here.",
        ]
    )

    pdf.h1("Daily checklist")
    pdf.h2("Supervisor")
    pdf.bullets(
        [
            "Build / refresh Morning board for today.",
            "Make the round active for assignment.",
            "Auto-assign (or amend) housekeeper rooms.",
            "Verify submitted rooms and follow up DND / partial / exceptions.",
        ]
    )
    pdf.h2("Housekeeper")
    pdf.bullets(
        [
            "Prepare and issue cart.",
            "For each room: Start → Matches standard (or adjust) → Room result → Submit.",
            "Record daily guest extras and stop them at checkout when needed.",
            "Photograph problems when evidence is required.",
        ]
    )
    pdf.h2("Owner / Superadmin")
    pdf.bullets(
        [
            "Complete Hotel setup before the first live day.",
            "Confirm linen needs totals look right.",
            "Use Admin for ongoing room and staff defaults.",
            "Grow packs (team, floors, custody, laundry partner) when the property needs them.",
        ]
    )

    pdf.h1("Glossary")
    terms = [
        (
            "Fitted set",
            "The standard sheets, towels, and pieces that belong in a room type. Hard ceiling for normal install.",
        ),
        (
            "Extras",
            "Guest-request or standing items recorded on My rooms. They never change the fitted standard.",
        ),
        (
            "Morning board",
            "Supervisor’s daily list of occupied rooms that need linen service.",
        ),
        (
            "Matches standard",
            "Housekeeper shortcut: clean-in / soiled-out equals the fitted set for that room.",
        ),
        (
            "Float / buffer",
            "Unattributed cart linen carried for top-ups, separate from room-assigned quantities.",
        ),
        (
            "Exception",
            "A room whose fitted linen differs from its type standard, or a reported problem (missing / damaged).",
        ),
    ]
    for term, meaning in terms:
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Body", "B", 10)
        pdf.set_text_color(*BRAND)
        pdf.multi_cell(pdf.epw, 5.5, term)
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Body", "", 10)
        pdf.set_text_color(*INK)
        pdf.multi_cell(pdf.epw, 5.5, meaning)
        pdf.ln(2)

    pdf.h1("Support and demo note")
    pdf.p(
        "The Masaero LINOS Hotel seed is synthetic / approximate for demonstration. "
        "Do not treat demo room counts or linen quantities as official hotel data. "
        "Commercial Free Version workspaces show a Free Version banner instead of the demo disclaimer."
    )
    pdf.p(
        "For product feedback from inside the app, use the Feedback screen when available. "
        "Platform operators can manage multiple properties; Free Version owners see only their own hotel."
    )

    OUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUT_PDF))
    REPO_COPY.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(REPO_COPY))
    return OUT_PDF


if __name__ == "__main__":
    path = build()
    print(f"Wrote {path} ({path.stat().st_size} bytes)")
    print(f"Repo copy {REPO_COPY} ({REPO_COPY.stat().st_size} bytes)")
