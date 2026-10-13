# OPD Flow — AAYU 2026 T05 Hackathon Prototype

Frontend-only OPD queue demo (React + Vite + plain CSS). No backend, database, API or login.
**SYNTHETIC DATA — NOT FOR CLINICAL USE.** Rules are simple, illustrative and not clinically validated.

## Run
```bash
npm install
npm run dev
```
Open the URL Vite prints (usually http://localhost:5173).

## Demo script (≈3 min)
1. Dashboard: summary cards, queue, search + priority filters. Click a row for patient details and the rule-based reason.
2. **Register Patient**: leave vitals blank to see "Missing — Staff review required". Live suggestion preview appears in the form.
3. Open a patient → **Nurse override** (pick a reason) → check **Audit Trail**.
4. **Report patient feels worse** → creates a review task; priority is NOT changed.
5. **+15 min (demo)** in the top bar → waiting 45+ min creates an operational task (priority unchanged).
6. **Review Tasks**: Assign / Acknowledge / Close.
7. **Reset Demo** restores the original sample data.

## Notes
- State lives in React state and is saved to `localStorage` (so refresh keeps your changes). Reset Demo clears it.
- Rules live in the `triage()` function in `src/App.jsx`; styling in `src/App.css`.
