const PDF_STATUSES = new Set([
    "Submitted",
    "Awaiting Board Decision",
    "Approved",
    "Declined",
    "Withdrawn"
]);

const provided = (value) => {
    if (value === undefined || value === null) return "Not Provided";
    const text = String(value).trim();
    return text || "Not Provided";
};

const yesNo = (value) =>
    value === true ? "Yes" : value === false ? "No" : "Not Provided";

const formatDate = (value) => {
    if (!value) return "Not Provided";
    const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    const date = dateOnly
        ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
        : typeof value.toDate === "function" ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime())
        ? provided(value)
        : new Intl.DateTimeFormat("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric"
        }).format(date);
};

const sanitizeFilenamePart = (value) =>
    String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

const getFilename = (applicationData) => {
    const parts = [
        sanitizeFilenamePart(applicationData.firstName),
        sanitizeFilenamePart(applicationData.lastName),
        Number.isInteger(applicationData.membershipYear)
            ? String(applicationData.membershipYear)
            : ""
    ].filter(Boolean);
    return parts.length
        ? `WBA-Membership-Application-${parts.join("-")}.pdf`
        : "WBA-Membership-Application.pdf";
};

const loadLocalLogo = async () => {
    try {
        const response = await fetch(new URL("./images/wba-icon.png", import.meta.url));
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn("The WBA logo could not be added to the application PDF.", error);
        return null;
    }
};

export const canDownloadMembershipApplicationPdf = (applicationData) =>
    PDF_STATUSES.has(applicationData?.applicationStatus);

export const generateMembershipApplicationPdf = async (
    applicationData,
    questionRows
) => {
    if (!canDownloadMembershipApplicationPdf(applicationData)) {
        throw new Error("A submitted application is required to generate the official PDF.");
    }

    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) {
        throw new Error("The PDF generator could not be loaded. Check your connection and try again.");
    }

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 54;
    const contentWidth = pageWidth - margin * 2;
    const bottom = pageHeight - 52;
    const lineHeight = 14;
    let y = margin;

    const addPage = () => {
        pdf.addPage("letter", "portrait");
        y = margin;
    };
    const ensureSpace = (height) => {
        if (y + height > bottom) addPage();
    };
    const writeWrapped = (text, options = {}) => {
        const indent = options.indent || 0;
        pdf.setFont("helvetica", options.fontStyle || "normal");
        pdf.setFontSize(options.fontSize || 10);
        pdf.setTextColor(...(options.color || [35, 35, 35]));
        pdf.splitTextToSize(provided(text), contentWidth - indent).forEach((line) => {
            ensureSpace(lineHeight);
            pdf.text(line, margin + indent, y);
            y += lineHeight;
        });
    };
    const addSection = (title, rows) => {
        const visibleRows = rows.filter(([, value]) => value !== undefined);
        if (!visibleRows.length) return;
        ensureSpace(38);
        y += 10;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.setTextColor(45, 45, 45);
        pdf.text(title.toUpperCase(), margin, y);
        y += 6;
        pdf.setDrawColor(160, 160, 160);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 16;
        visibleRows.forEach(([label, value], index) => {
            ensureSpace(36);
            writeWrapped(label, { fontSize: 9, fontStyle: "bold", color: [75, 75, 75] });
            writeWrapped(value, { indent: 10 });
            if (index < visibleRows.length - 1) y += 5;
        });
    };

    const logo = await loadLocalLogo();
    if (logo) {
        try {
            pdf.addImage(logo, "PNG", margin, y, 42, 42, undefined, "FAST");
        } catch (error) {
            console.warn("The WBA logo could not be rendered in the application PDF.", error);
        }
    }
    const headerX = logo ? margin + 54 : margin;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text("Working Beauceron Association", headerX, y + 14);
    pdf.setFontSize(21);
    pdf.text("Membership Application", headerX, y + 36);
    y += 62;

    addSection("Personal Information", [
        ["First Name", applicationData.firstName],
        ["Last Name", applicationData.lastName],
        ["Preferred Name", applicationData.preferredName],
        ["Email", applicationData.email],
        ["Phone", applicationData.phone],
        ["Date of Birth", formatDate(applicationData.dateOfBirth)]
    ]);
    addSection("Membership Information", [
        ["Membership Type", applicationData.membershipType],
        ["Membership Year", applicationData.membershipYear],
        ["Dues Amount", typeof applicationData.membershipDuesAmount === "number"
            ? `$${applicationData.membershipDuesAmount}`
            : "Not Provided"],
        ["Submitted Date", formatDate(applicationData.submittedAt)],
        ["Application Status", applicationData.applicationStatus]
    ]);
    addSection("Address", [
        ["Street Address", applicationData.address],
        ["City", applicationData.city],
        ["State / Province / Region", applicationData.subdivisionName || applicationData.state],
        ["ZIP / Postal Code", applicationData.zip],
        ["Country", applicationData.countryName || applicationData.country]
    ]);
    addSection("Sponsor", [[
        "Sponsor",
        applicationData.sponsorRequested === true
            ? "Sponsor Request Pending"
            : applicationData.sponsorDisplayName
    ]]);
    addSection("Agreements", [
        ["Bylaws Accepted", yesNo(applicationData.bylawsAccepted)],
        ["Code of Ethics Accepted", yesNo(applicationData.codeOfEthicsAccepted)],
        ["Electronic Communications Accepted", yesNo(applicationData.communicationsConsent)]
    ]);
    addSection("Additional Application Questions", questionRows);
    addSection("Board Review", [
        ["Sent to Board", applicationData.adminReviewedAt ? formatDate(applicationData.adminReviewedAt) : undefined],
        ["Board Decision Date", applicationData.reviewedAt ? formatDate(applicationData.reviewedAt) : undefined]
    ]);

    const pageCount = pdf.getNumberOfPages();
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        pdf.setPage(pageNumber);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(
            `WBA Membership Application  •  Page ${pageNumber} of ${pageCount}`,
            pageWidth / 2,
            pageHeight - 24,
            { align: "center" }
        );
    }
    pdf.save(getFilename(applicationData));
};
