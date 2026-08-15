const textValue = (value, fallback = "Not Set") => {
    if (value === undefined || value === null || value === "") return fallback;
    return String(value);
};

const sanitizeFilenamePart = (value) =>
    String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

const historyDate = (value, includeTime = false) => {
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {})
    }).format(date);
};

export const generateMemberHistoryPdf = async ({
    memberData,
    entries,
    actionLabels,
    formatValue
}) => {
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) {
        throw new Error("The PDF generator could not be loaded.");
    }

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 54;
    const contentWidth = pageWidth - margin * 2;
    const bottom = pageHeight - 48;
    let y = margin;

    const ensureSpace = (height) => {
        if (y + height <= bottom) return;
        pdf.addPage("letter", "portrait");
        y = margin;
    };
    const write = (value, { size = 10, bold = false, indent = 0 } = {}) => {
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
        const lines = pdf.splitTextToSize(textValue(value), contentWidth - indent);
        lines.forEach((line) => {
            ensureSpace(15);
            pdf.text(line, margin + indent, y);
            y += 15;
        });
    };

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("Working Beauceron Association", margin, y);
    y += 24;
    pdf.setFontSize(20);
    pdf.text("Member History", margin, y);
    y += 28;

    const memberName = [memberData?.firstName, memberData?.lastName]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
        .join(" ") || "Member";
    write("Member", { bold: true });
    write(memberName, { indent: 10 });
    y += 4;
    write("Member ID", { bold: true });
    write(memberData?.memberId, { indent: 10 });
    y += 4;
    write("Generated", { bold: true });
    write(historyDate(new Date()), { indent: 10 });
    y += 18;
    write("HISTORY", { size: 12, bold: true });
    pdf.setDrawColor(150, 150, 150);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 18;

    entries.forEach((entry) => {
        ensureSpace(78);
        write(historyDate(entry.performedAt, true), { bold: true });
        write(actionLabels[entry.action] || "Administrative Event", { bold: true });
        if (entry.field) {
            write(`${formatValue(entry, entry.oldValue)} → ${formatValue(entry, entry.newValue)}`, {
                indent: 10
            });
        }
        write(`Changed by ${entry.actorName || "Admin"}`, { indent: 10 });
        if (entry.note) write(entry.note, { indent: 10 });
        y += 12;
    });

    const firstName = sanitizeFilenamePart(memberData?.firstName);
    const lastName = sanitizeFilenamePart(memberData?.lastName);
    const namePart = [firstName, lastName].filter(Boolean).join("-");
    pdf.save(namePart
        ? `WBA-Member-History-${namePart}.pdf`
        : "WBA-Member-History.pdf");
};
