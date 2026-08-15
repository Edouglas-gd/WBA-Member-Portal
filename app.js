import {
    firebaseApp,
    db,
    storage
} from "./firebase-config.js";

import {
    getCountry,
    resolveCountry,
    resolveSubdivision,
    populateCountrySelect,
    populateSubdivisionSelect
} from "./location-data.js";

import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-storage.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

import {
    doc,
    setDoc,
    getDoc,
    collection,
    getDocs,
    deleteField,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";


const auth = getAuth(firebaseApp);

const loadAdminMemberAccounts = async () => {
    const snapshot = await getDocs(collection(db, "users"));
    return snapshot.docs.map((memberSnapshot) => ({
        ...memberSnapshot.data(),
        uid: memberSnapshot.id
    }));
};

const loadAdminApplications = async () => {
    const snapshot = await getDocs(collection(db, "membershipApplications"));
    return snapshot.docs.map((applicationSnapshot) => ({
        ...applicationSnapshot.data(),
        applicantUid: applicationSnapshot.id
    }));
};

const createMemberHistoryRef = (memberUid) =>
    doc(collection(db, "memberHistory", memberUid, "entries"));

const buildMemberHistoryEntry = ({
    memberUid,
    action,
    category,
    performedBy,
    field = null,
    oldValue = null,
    newValue = null,
    source,
    note = null
}) => ({
    memberUid,
    action,
    category,
    performedAt: serverTimestamp(),
    performedBy,
    field,
    oldValue,
    newValue,
    source,
    note
});


const sendVerificationEmail =
    async (user, source) => {

        console.log(
            `[Email verification] Send beginning (${source}).`
        );


        try {

            await sendEmailVerification(user);


            console.log(
                `[Email verification] Send resolved successfully (${source}).`
            );

        } catch (error) {

            console.error(
                `[Email verification] Send failed (${source}).`,
                error
            );

            throw error;

        }

    };


const DOG_SPORT_OPTIONS = [
    { id: "scent-work", label: "Scent Work / Nose Work" },
    { id: "igp", label: "IGP" },
    { id: "french-ring", label: "French Ring" },
    { id: "mondioring", label: "Mondioring" },
    { id: "psa", label: "PSA" },
    { id: "herding", label: "Herding" },
    { id: "search-and-rescue", label: "Search & Rescue" },
    { id: "tracking", label: "Tracking" },
    { id: "mantrailing", label: "Mantrailing" },
    { id: "joring-canicross", label: "Joring / Canicross" },
    { id: "obedience", label: "Obedience" },
    { id: "rally", label: "Rally" },
    { id: "agility", label: "Agility" },
    { id: "dock-diving", label: "Dock Diving" },
    { id: "fast-cat-lure-coursing", label: "Fast CAT / Lure Coursing" },
    { id: "barn-hunt", label: "Barn Hunt" },
    { id: "disc-dog", label: "Disc Dog" },
    { id: "flyball", label: "Flyball" },
    { id: "weight-pull", label: "Weight Pull" },
    { id: "conformation", label: "Conformation" },
    { id: "service-dog-training", label: "Service Dog Training" },
    { id: "trick-dog", label: "Trick Dog" },
    { id: "farm-stock-work", label: "Farm / Stock Work" },
    { id: "hunting-field-work", label: "Hunting / Field Work" }
];

const DOG_SPORT_IDS =
    new Set(
        DOG_SPORT_OPTIONS.map(
            (option) => option.id
        )
    );

const DOG_SPORT_LABELS =
    new Map(
        DOG_SPORT_OPTIONS.map(
            (option) => [
                option.id,
                option.label
            ]
        )
    );

const MEMBERSHIP_STATUSES = [
    "Active",
    "Renewals Pending",
    "Past Due",
    "Archived",
    "Pending Application",
    "Pending Dues",
    "Suspended",
    "Expelled"
];

const MEMBERSHIP_TYPES = [
    "Individual",
    "Joint",
    "Junior",
    "Foreign"
];

const DUES_ATTENTION_STATUSES =
    new Set(["Pending Dues", "Past Due"]);

const FALLBACK_MEMBERSHIP_CONFIG = {
    Individual: {
        active: true,
        annualDues: 35,
        displayName: "Individual Membership",
        description: "Standard WBA membership for one adult member."
    },
    Joint: {
        active: true,
        annualDues: 65,
        displayName: "Joint Membership",
        description: "Membership for two linked members sharing the same household/address."
    },
    Junior: {
        active: true,
        annualDues: null,
        displayName: "Junior Membership",
        description: "For junior applicants who are between 10 and 18 years old on January 1 of the membership year."
    },
    Foreign: {
        active: true,
        annualDues: 35,
        displayName: "Foreign Membership",
        description: "For applicants whose primary residence is outside the United States and Canada."
    }
};


const normalizeMembershipConfig = (configuredTypes = {}) => {
    const normalized = {};
    MEMBERSHIP_TYPES.forEach((membershipType) => {
        const fallback = FALLBACK_MEMBERSHIP_CONFIG[membershipType];
        const configured = configuredTypes?.[membershipType];
        normalized[membershipType] = {
            active: typeof configured?.active === "boolean" ? configured.active : fallback.active,
            annualDues: typeof configured?.annualDues === "number" || configured?.annualDues === null
                ? configured.annualDues
                : fallback.annualDues,
            displayName: configured?.displayName || fallback.displayName,
            description: configured?.description || fallback.description
        };
    });
    return normalized;
};


const loadMembershipConfig = async () => {
    try {
        const snapshot = await getDoc(doc(db, "membershipConfig", "current"));
        return snapshot.exists()
            ? normalizeMembershipConfig(snapshot.data().membershipTypes)
            : normalizeMembershipConfig();
    } catch (error) {
        console.error("Membership configuration could not be loaded; using fallback configuration.", error);
        return normalizeMembershipConfig();
    }
};


const getAgeOnJanuaryFirst = (dateOfBirth, membershipYear) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth || "")) return null;
    const [birthYear, birthMonth, birthDay] = dateOfBirth.split("-").map(Number);
    return membershipYear - birthYear - (birthMonth > 1 || birthDay > 1 ? 1 : 0);
};


const isJuniorEligible = (dateOfBirth, membershipYear) => {
    const age = getAgeOnJanuaryFirst(dateOfBirth, membershipYear);
    return age !== null && age >= 10 && age <= 18;
};


const validateMembershipTypeEligibility = (applicationData, membershipYear) => {
    if (applicationData.membershipType === "Junior") {
        if (!applicationData.dateOfBirth) {
            return "Date of Birth is required for Junior Membership.";
        }
        if (!isJuniorEligible(applicationData.dateOfBirth, membershipYear)) {
            return `Junior applicants must be between 10 and 18 years old on January 1, ${membershipYear}.`;
        }
    }

    const isForeignResidence = !["US", "CA"].includes(applicationData.countryCode);
    if (isForeignResidence && ["Individual", "Joint"].includes(applicationData.membershipType)) {
        return "Applicants residing outside the United States and Canada must select Foreign Membership.";
    }
    if (!isForeignResidence && applicationData.membershipType === "Foreign") {
        return "Foreign Membership is for applicants residing outside the United States and Canada.";
    }
    return "";
};


const getAdminAuthorization = async (authenticatedUser) => {
    if (!authenticatedUser) return {active: false, superAdmin: false};
    const snapshot = await getDoc(doc(db, "adminUsers", authenticatedUser.uid));
    const data = snapshot.exists() ? snapshot.data() : {};
    return {
        active: data.active === true,
        superAdmin: data.superAdmin === true
    };
};


const getCurrentPage = () =>
    window.location.pathname.split("/").pop() || "index.html";


const logRoutingDecision = ({
    authenticatedUser,
    authorization,
    memberRecordExists,
    decision,
    reason
}) => {
    console.log("[Routing]", {
        page: getCurrentPage(),
        uid: authenticatedUser?.uid || null,
        verified: authenticatedUser?.emailVerified === true,
        admin: authorization?.active === true,
        superAdmin: authorization?.superAdmin === true,
        memberRecordExists: memberRecordExists === true,
        decision,
        reason
    });
};


const redirectToPage = (destination, reason, routingState = {}) => {
    const currentPage = getCurrentPage();
    const destinationPage = destination.split("?")[0];
    logRoutingDecision({
        ...routingState,
        decision: currentPage === destinationPage ? "stay-current-page" : `redirect:${destination}`,
        reason
    });
    if (currentPage === destinationPage) return false;
    window.location.replace(destination);
    return true;
};


const isAuthorizedAdmin =
    async (authenticatedUser) => {

        if (!authenticatedUser) {
            return false;
        }


        const authorization = await getAdminAuthorization(authenticatedUser);
        return authorization?.active === true;

    };


const CURRENT_MEMBER_STATUSES =
    new Set(["Active", "Renewals Pending"]);

const STATUS_PAGE_MEMBERSHIP_STATUSES =
    new Set([
        "Pending Application",
        "Pending Dues",
        "Past Due",
        "Archived",
        "Inactive",
        "Expired",
        "Lapsed",
        "Resigned",
        "Suspended",
        "Expelled"
    ]);

    const STATUS_PAGE_APPLICATION_STATUSES =
    new Set([
        "Submitted",
        "Awaiting Board Decision",
        "Approved",
        "Declined",
        "Withdrawn"
    ]);


const getPostLoginRoute =
    async (authenticatedUser) => {

        if (!authenticatedUser?.emailVerified) {
            logRoutingDecision({
                authenticatedUser,
                authorization: {active: false, superAdmin: false},
                memberRecordExists: false,
                decision: "membership-application.html",
                reason: "email-unverified"
            });
            return {
                destination: "membership-application.html",
                userData: {},
                applicationData: null,
                authorization: {active: false, superAdmin: false},
                memberRecordExists: false
            };
        }

        const authorization = await getAdminAuthorization(authenticatedUser);
        if (authorization?.active === true && authorization?.superAdmin === true) {
            let memberRecordExists = false;
            try {
                memberRecordExists = (
                    await getDoc(doc(db, "users", authenticatedUser.uid))
                ).exists();
            } catch (error) {
                console.warn("[Routing] Super Admin member-record diagnostic read failed.", error);
            }
            logRoutingDecision({
                authenticatedUser,
                authorization,
                memberRecordExists,
                decision: "admin.html",
                reason: "active-super-admin-priority"
            });
            return {
                destination: "admin.html",
                userData: {},
                applicationData: null,
                authorization,
                memberRecordExists
            };
        }


        const [userSnapshot, applicationSnapshot] =
            await Promise.all([
                getDoc(doc(db, "users", authenticatedUser.uid)),
                getDoc(doc(db, "membershipApplications", authenticatedUser.uid))
            ]);

        const userData =
            userSnapshot.exists() ? userSnapshot.data() : {};

        const applicationData =
            applicationSnapshot.exists() ? applicationSnapshot.data() : null;

        const membershipStatus = userData.membershipStatus || "";
        const applicationStatus = applicationData?.applicationStatus || "";

        const returnRoute = (destination, reason) => {
            logRoutingDecision({
                authenticatedUser,
                authorization,
                memberRecordExists: userSnapshot.exists(),
                decision: destination,
                reason
            });
            return {
                destination,
                userData,
                applicationData,
                authorization,
                memberRecordExists: userSnapshot.exists()
            };
        };


        if (CURRENT_MEMBER_STATUSES.has(membershipStatus)) {
            return returnRoute("dashboard.html", "current-member");
        }

        if (
            STATUS_PAGE_MEMBERSHIP_STATUSES.has(membershipStatus) ||
            STATUS_PAGE_APPLICATION_STATUSES.has(applicationStatus)
        ) {
            return returnRoute("membership-status.html", "membership-or-application-status");
        }

        if (membershipStatus && membershipStatus !== "No Membership") {
            return returnRoute("membership-status.html", "nonstandard-membership-status");
        }

        if (!applicationData || applicationStatus === "Draft") {
            return returnRoute("membership-application.html", "application-not-started-or-draft");
        }

        return returnRoute("membership-status.html", "application-progress");

    };


const routeAuthenticatedUser =
    async (authenticatedUser) => {

        const route =
            await getPostLoginRoute(authenticatedUser);

        redirectToPage(route.destination, "post-login-route", {
            authenticatedUser,
            authorization: route.authorization,
            memberRecordExists: route.memberRecordExists
        });

    };


// ------------------------------------
// Landing Page
// ------------------------------------

const loginButton =
    document.getElementById("loginButton");

const createAccountButton =
    document.getElementById("createAccountButton");


if (loginButton) {

    loginButton.addEventListener("click", () => {

        window.location.href = "login.html";

    });

}


if (createAccountButton) {

    createAccountButton.addEventListener("click", () => {

        window.location.href = "create-account.html";

    });

}


// ------------------------------------
// Create Account
// ------------------------------------

const createAccountForm =
    document.getElementById("createAccountForm");


if (createAccountForm) {

    const message =
        document.getElementById("message");


    createAccountForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            const email =
                document.getElementById("email").value.trim();

            const password =
                document.getElementById("password").value;

            const confirmPassword =
                document.getElementById("confirmPassword").value;


            message.textContent = "";


            if (password !== confirmPassword) {

                message.textContent =
                    "The passwords do not match.";

                return;
            }


            let userCredential;


            try {

                userCredential =
                    await createUserWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                console.log(
                    "[Account creation] Firebase Authentication account created successfully."
                );

            } catch (error) {

                console.error(
                    "[Account creation] Firebase Authentication account creation failed.",
                    error
                );


                message.textContent =
                    "We couldn't create your account. Please check your information and try again.";

                return;

            }


            try {


                await sendVerificationEmail(
                    userCredential.user,
                    "initial account creation"
                );

                window.location.href =
                    "membership-application.html?verification=sent";


            } catch (error) {

                window.location.href =
                    "membership-application.html?verification=failed";

            }

        }
    );

}


// ------------------------------------
// Membership Application Onboarding
// ------------------------------------

const membershipApplicationPage =
    document.getElementById(
        "membershipApplicationPage"
    );


if (membershipApplicationPage) {

    const applicationVerificationHeading =
        document.getElementById(
            "applicationVerificationHeading"
        );

    const applicationVerificationMessage =
        document.getElementById(
            "applicationVerificationMessage"
        );

    const applicationResendButton =
        document.getElementById(
            "applicationResendVerificationButton"
        );

    const applicationRefreshButton =
        document.getElementById(
            "applicationRefreshVerificationButton"
        );

    const membershipApplicationForm =
        document.getElementById(
            "membershipApplicationForm"
        );

    const applicationFormMessage =
        document.getElementById(
            "applicationFormMessage"
        );

    const saveApplicationDraftButton =
        document.getElementById(
            "saveApplicationDraftButton"
        );

    const applicationMembershipType =
        document.getElementById(
            "applicationMembershipType"
        );

    const applicationCountrySelect =
        document.getElementById("applicationCountry");

    const applicationSubdivisionSelect =
        document.getElementById("applicationState");

    const sponsorSearchInput =
        document.getElementById(
            "sponsorSearchInput"
        );

    const sponsorSearchResults =
        document.getElementById(
            "sponsorSearchResults"
        );

    let currentApplication = null;
    let sponsorProfiles = [];
    let selectedSponsorUserId = "";
    let selectedSponsorDisplayName = "";
    let sponsorRequested = false;
    let applicationUser = null;
    let unmappedApplicationCountry = "";
    let unmappedApplicationSubdivision = "";
    let membershipConfig = normalizeMembershipConfig();
    const applicableMembershipYear = new Date().getFullYear();
    const getDraftMembershipYear = () =>
        currentApplication?.membershipYear || applicableMembershipYear;

    let verificationState =
        new URLSearchParams(
            window.location.search
        ).get("verification");


    populateCountrySelect(applicationCountrySelect);
    populateSubdivisionSelect(applicationSubdivisionSelect, "");

    applicationCountrySelect.addEventListener("change", () => {
        unmappedApplicationCountry = "";
        unmappedApplicationSubdivision = "";
        populateSubdivisionSelect(
            applicationSubdivisionSelect,
            applicationCountrySelect.value
        );
        updateMembershipEligibilityMessage();
    });


    const applicationDogSportsCheckboxGrid =
        document.getElementById("applicationDogSportsCheckboxGrid");


    DOG_SPORT_OPTIONS.forEach((option) => {
        const label = document.createElement("label");
        label.className = "checkbox-option";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = option.id;
        checkbox.dataset.applicationDogSport = "true";
        const labelText = document.createElement("span");
        labelText.textContent = option.label;
        label.append(checkbox, labelText);
        applicationDogSportsCheckboxGrid.appendChild(label);
    });


    const applicationFieldIds = {
        firstName: "applicationFirstName",
        lastName: "applicationLastName",
        preferredName: "applicationPreferredName",
        email: "applicationEmail",
        phone: "applicationPhone",
        dateOfBirth: "applicationDateOfBirth",
        address: "applicationAddress",
        city: "applicationCity",
        zip: "applicationZip",
        membershipType: "applicationMembershipType",
        animalOrganizations: "animalOrganizations",
        disciplineExplanation: "disciplineExplanation"
    };


    const formatAnnualDues = (annualDues) =>
        typeof annualDues === "number"
            ? `$${annualDues.toLocaleString("en-US")}/year`
            : "";


    const updateMembershipEligibilityMessage = () => {
        const message = document.getElementById("membershipEligibilityMessage");
        const membershipType = applicationMembershipType.value;
        const countryCode = applicationCountrySelect.value;
        const dateOfBirth = document.getElementById("applicationDateOfBirth").value;

        if (membershipType === "Junior") {
            const membershipYear = getDraftMembershipYear();
            const age = getAgeOnJanuaryFirst(dateOfBirth, membershipYear);
            message.textContent = age === null
                ? `Enter Date of Birth to confirm Junior eligibility for ${membershipYear}.`
                : isJuniorEligible(dateOfBirth, membershipYear)
                    ? `Eligible for Junior Membership: age ${age} on January 1, ${membershipYear}.`
                    : `Not eligible for Junior Membership: applicants must be age 10–18 on January 1, ${membershipYear}.`;
            return;
        }

        if (countryCode && !["US", "CA"].includes(countryCode)) {
            message.textContent = membershipType === "Foreign"
                ? "Foreign Membership matches the selected country of residence."
                : "Applicants outside the United States and Canada should select Foreign Membership.";
            return;
        }

        if (["US", "CA"].includes(countryCode) && membershipType === "Foreign") {
            message.textContent = "Foreign Membership is for applicants residing outside the United States and Canada.";
            return;
        }

        message.textContent = "";
    };


    const renderMembershipTypeCards = (selectedType = applicationMembershipType.value) => {
        const cards = document.getElementById("membershipTypeCards");
        cards.replaceChildren();

        MEMBERSHIP_TYPES.forEach((membershipType) => {
            const configuration = membershipConfig[membershipType];
            if (!configuration?.active) return;

            const label = document.createElement("label");
            label.className = "membership-type-card";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "membershipTypeChoice";
            radio.value = membershipType;
            radio.checked = membershipType === selectedType;

            const content = document.createElement("span");
            const heading = document.createElement("strong");
            heading.textContent = configuration.displayName;
            content.appendChild(heading);

            const dues = formatAnnualDues(configuration.annualDues);
            if (dues) {
                const duesElement = document.createElement("span");
                duesElement.className = "membership-type-price";
                duesElement.textContent = dues;
                content.appendChild(duesElement);
            }

            const description = document.createElement("span");
            description.textContent = configuration.description;
            content.appendChild(description);
            label.append(radio, content);
            cards.appendChild(label);

            radio.addEventListener("change", () => {
                applicationMembershipType.value = membershipType;
                document.getElementById("membershipTypeNote").hidden =
                    !["Joint", "Junior"].includes(membershipType);
                updateMembershipEligibilityMessage();
            });
        });

        applicationMembershipType.value =
            membershipConfig[selectedType]?.active ? selectedType : "";
        updateMembershipEligibilityMessage();
    };


    document.getElementById("applicationDateOfBirth").addEventListener(
        "change",
        updateMembershipEligibilityMessage
    );


    const renderSelectedSponsor = () => {
        const selectedSponsor = document.getElementById("selectedSponsor");
        selectedSponsor.hidden = !selectedSponsorUserId && !sponsorRequested;
        document.getElementById("selectedSponsorLabel").textContent =
            sponsorRequested ? "Sponsor" : "Selected Sponsor";
        document.getElementById("selectedSponsorName").textContent =
            sponsorRequested ? "Sponsor Request Pending" : selectedSponsorDisplayName;
        document.getElementById("sponsorRequested").checked = sponsorRequested;
    };


    const isActiveSponsorProfile = (profile) =>
        profile?.sponsorEligible === true;


    const renderSponsorResults = (searchTerm) => {
        sponsorSearchResults.replaceChildren();
        const normalizedSearch = searchTerm.trim().toLocaleLowerCase();

        if (!normalizedSearch) return;

        const matches = sponsorProfiles
            .filter((profile) => profile.uid !== applicationUser?.uid)
            .filter(isActiveSponsorProfile)
            .filter((profile) => [
                profile.displayName,
                profile.firstName,
                profile.lastName,
                profile.preferredName
            ].some((value) => String(value || "").toLocaleLowerCase().includes(normalizedSearch)))
            .slice(0, 8);

        if (!matches.length) {
            const message = document.createElement("p");
            message.className = "profile-muted";
            message.textContent = "No matching current members found.";
            sponsorSearchResults.appendChild(message);
            return;
        }

        matches.forEach((profile) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = profile.displayName ||
                `${profile.preferredName || profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
                "WBA Member";
            button.addEventListener("click", () => {
                selectedSponsorUserId = profile.uid;
                selectedSponsorDisplayName = button.textContent;
                sponsorRequested = false;
                sponsorSearchInput.value = "";
                sponsorSearchResults.replaceChildren();
                renderSelectedSponsor();
            });
            sponsorSearchResults.appendChild(button);
        });
    };


    sponsorSearchInput.addEventListener("input", () => {
        renderSponsorResults(sponsorSearchInput.value);
    });


    document.getElementById("clearSponsorButton").addEventListener("click", () => {
        selectedSponsorUserId = "";
        selectedSponsorDisplayName = "";
        sponsorRequested = false;
        renderSelectedSponsor();
    });


    document.getElementById("sponsorRequested").addEventListener("change", (event) => {
        sponsorRequested = event.target.checked;
        if (sponsorRequested) {
            selectedSponsorUserId = "";
            selectedSponsorDisplayName = "";
            sponsorSearchInput.value = "";
            sponsorSearchResults.replaceChildren();
        }
        renderSelectedSponsor();
    });


    const updateDisciplineExplanationVisibility = () => {
        const selectedValue = membershipApplicationForm.querySelector(
            'input[name="disciplineHistory"]:checked'
        )?.value;
        document.getElementById("disciplineExplanationField").hidden =
            selectedValue !== "yes";
    };


    membershipApplicationForm.querySelectorAll(
        'input[name="disciplineHistory"]'
    ).forEach((radio) => radio.addEventListener(
        "change",
        updateDisciplineExplanationVisibility
    ));


    const collectApplicationData = () => {
        const data = {};
        Object.entries(applicationFieldIds).forEach(([fieldName, elementId]) => {
            data[fieldName] = document.getElementById(elementId).value.trim();
        });

        const disciplineValue = membershipApplicationForm.querySelector(
            'input[name="disciplineHistory"]:checked'
        )?.value;

        data.disciplineHistory =
            disciplineValue === "yes"
                ? true
                : disciplineValue === "no"
                    ? false
                    : null;
        const ownershipValue = membershipApplicationForm.querySelector(
            'input[name="ownsBeauceron"]:checked'
        )?.value;
        data.ownsBeauceron =
            ownershipValue === "yes"
                ? true
                : ownershipValue === "no"
                    ? false
                    : null;
        data.dogSports = Array.from(
            applicationDogSportsCheckboxGrid.querySelectorAll(
                'input[data-application-dog-sport="true"]:checked'
            ),
            (checkbox) => checkbox.value
        );
        data.bylawsAccepted = document.getElementById("bylawsAccepted").checked;
        data.codeOfEthicsAccepted = document.getElementById("codeOfEthicsAccepted").checked;
        data.communicationsConsent = document.getElementById("communicationsConsent").checked;
        const selectedCountry = getCountry(applicationCountrySelect.value);
        const selectedSubdivision = selectedCountry?.subdivisions.find(
            (subdivision) => subdivision.code === applicationSubdivisionSelect.value
        ) || null;
        data.countryCode = selectedCountry?.code || "";
        data.countryName = selectedCountry?.name || "";
        data.subdivisionCode = selectedSubdivision?.code || "";
        data.subdivisionName = selectedSubdivision?.name || "";
        data.membershipDuesAmount =
            membershipConfig[data.membershipType]?.annualDues ?? null;
        // Readable aliases remain temporarily for legacy consumers.
        data.country = data.countryName || unmappedApplicationCountry;
        data.state = data.subdivisionName || unmappedApplicationSubdivision;
        data.sponsorRequested = sponsorRequested;
        if (selectedSponsorUserId && !sponsorRequested) {
            data.sponsorUserId = selectedSponsorUserId;
            data.sponsorDisplayName = selectedSponsorDisplayName;
        }
        return data;
    };


    const validateMembershipApplicationSubmission = (data, user) => {
        if (!user.emailVerified) {
            return "You must verify your email address before submitting your application.";
        }

        const requiredLabels = {
            firstName: "First Name",
            lastName: "Last Name",
            email: "Email",
            phone: "Phone",
            address: "Street Address",
            city: "City",
            zip: "ZIP / Postal Code",
            countryCode: "Country",
            membershipType: "Membership Type"
        };

        const missingFields = Object.entries(requiredLabels)
            .filter(([fieldName]) => !data[fieldName])
            .map(([, label]) => label);

        if (missingFields.length) {
            return `Please complete the following required fields: ${missingFields.join(", ")}.`;
        }
        if (!MEMBERSHIP_TYPES.includes(data.membershipType)) {
            return "Please select a valid membership type.";
        }
        if (!membershipConfig[data.membershipType]?.active) {
            return "The selected membership type is not currently available.";
        }
        if (data.membershipDuesAmount !== membershipConfig[data.membershipType].annualDues) {
            return "Membership pricing changed while this application was open. Please review the current membership option and try again.";
        }
        const selectedCountry = getCountry(data.countryCode);
        if (
            selectedCountry?.subdivisions.length > 0 &&
            !data.subdivisionCode
        ) {
            return "Please select a State / Province / Region for the selected country.";
        }
        const eligibilityMessage =
            validateMembershipTypeEligibility(data, getDraftMembershipYear());
        if (eligibilityMessage) return eligibilityMessage;
        if (!data.bylawsAccepted || !data.codeOfEthicsAccepted) {
            return "You must accept the WBA Bylaws and Code of Ethics before submitting.";
        }
        if (data.disciplineHistory === null) {
            return "Please answer the discipline history question.";
        }
        if (data.disciplineHistory && !data.disciplineExplanation) {
            return "Please provide an explanation of your discipline history.";
        }
        if (typeof data.ownsBeauceron !== "boolean") {
            return "Please answer whether you currently own a Beauceron.";
        }

        if (data.sponsorRequested) {
            if (data.sponsorUserId || data.sponsorDisplayName) {
                return "Please choose either an Active sponsor or Sponsor Request, not both.";
            }
        } else {
            if (!data.sponsorUserId || !data.sponsorDisplayName) {
                return "Please select an Active WBA sponsor or choose Sponsor Request.";
            }
            const selectedProfile = sponsorProfiles.find(
                (profile) => profile.uid === data.sponsorUserId
            );
            if (!isActiveSponsorProfile(selectedProfile)) {
                return "The selected sponsor is no longer eligible. Please select another Active WBA member or choose Sponsor Request.";
            }
        }

        return "";
    };


    const buildApplicationWriteData = (applicationStatus) => {
        const now = new Date().toISOString();
        return {
            applicantUid: applicationUser.uid,
            ...collectApplicationData(),
            membershipYear: currentApplication?.membershipYear || applicableMembershipYear,
            applicationStatus,
            createdAt: currentApplication?.createdAt || now,
            updatedAt: now,
            ...(applicationStatus === "Submitted" ? { submittedAt: now } : {})
        };
    };


    const setApplicationReadOnly = (readOnly) => {
        membershipApplicationForm.querySelectorAll("input, select, textarea, button")
            .forEach((control) => {
                control.disabled = readOnly;
            });
        document.getElementById("applicationFormActions").hidden = readOnly;
        if (readOnly) {
            sponsorSearchResults.replaceChildren();
        }
    };


    const populateApplicationForm = (applicationData, userData, authenticatedUser) => {
        const hasSavedValue = (fieldName) =>
            Object.prototype.hasOwnProperty.call(applicationData || {}, fieldName);

        Object.entries(applicationFieldIds).forEach(([fieldName, elementId]) => {
            const fallbackValue = fieldName === "email"
                ? authenticatedUser.email || userData.email || ""
                : userData[fieldName] || "";
            document.getElementById(elementId).value =
                hasSavedValue(fieldName) ? applicationData[fieldName] || "" : fallbackValue;
        });
        renderMembershipTypeCards(applicationMembershipType.value);

        const countrySource = (
            hasSavedValue("countryCode") ||
            hasSavedValue("countryName") ||
            hasSavedValue("country")
        ) ? applicationData : userData;
        const resolvedCountry = resolveCountry(
            countrySource?.countryCode,
            countrySource?.countryName || countrySource?.country
        );
        unmappedApplicationCountry = resolvedCountry
            ? ""
            : countrySource?.countryName || countrySource?.country || "";
        populateCountrySelect(applicationCountrySelect, resolvedCountry?.code || "");

        const subdivisionSource = (
            hasSavedValue("subdivisionCode") ||
            hasSavedValue("subdivisionName") ||
            hasSavedValue("state")
        ) ? applicationData : userData;
        const resolvedSubdivision = resolveSubdivision(
            resolvedCountry,
            subdivisionSource?.subdivisionCode,
            subdivisionSource?.subdivisionName || subdivisionSource?.state
        );
        unmappedApplicationSubdivision = resolvedSubdivision
            ? ""
            : subdivisionSource?.subdivisionName || subdivisionSource?.state || "";
        populateSubdivisionSelect(
            applicationSubdivisionSelect,
            resolvedCountry?.code || "",
            resolvedSubdivision?.code || ""
        );

        document.getElementById("bylawsAccepted").checked = applicationData?.bylawsAccepted === true;
        document.getElementById("codeOfEthicsAccepted").checked = applicationData?.codeOfEthicsAccepted === true;
        document.getElementById("communicationsConsent").checked = applicationData?.communicationsConsent === true;

        if (applicationData?.disciplineHistory === true) {
            membershipApplicationForm.querySelector('[name="disciplineHistory"][value="yes"]').checked = true;
        } else if (applicationData?.disciplineHistory === false) {
            membershipApplicationForm.querySelector('[name="disciplineHistory"][value="no"]').checked = true;
        }

        if (applicationData?.ownsBeauceron === true) {
            membershipApplicationForm.querySelector('[name="ownsBeauceron"][value="yes"]').checked = true;
        } else if (applicationData?.ownsBeauceron === false) {
            membershipApplicationForm.querySelector('[name="ownsBeauceron"][value="no"]').checked = true;
        }

        const selectedDogSports = hasSavedValue("dogSports")
            ? applicationData.dogSports
            : userData.dogSports;
        const validSelectedDogSports = new Set(
            Array.isArray(selectedDogSports)
                ? selectedDogSports.filter((sportId) => DOG_SPORT_IDS.has(sportId))
                : []
        );
        applicationDogSportsCheckboxGrid.querySelectorAll(
            'input[data-application-dog-sport="true"]'
        ).forEach((checkbox) => {
            checkbox.checked = validSelectedDogSports.has(checkbox.value);
        });

        selectedSponsorUserId = applicationData?.sponsorUserId || "";
        selectedSponsorDisplayName = applicationData?.sponsorDisplayName || "";
        sponsorRequested = applicationData?.sponsorRequested === true;
        if (sponsorRequested) {
            selectedSponsorUserId = "";
            selectedSponsorDisplayName = "";
        }
        renderSelectedSponsor();
        updateDisciplineExplanationVisibility();
        updateMembershipEligibilityMessage();

    };


    const renderApplicationVerificationState =
        (user) => {

            if (user.emailVerified) {

                document.getElementById(
                    "applicationEmailStatus"
                ).textContent = "Verified";

                applicationVerificationHeading.textContent =
                    "Email Verified";

                applicationVerificationMessage.textContent =
                    "Your email has been verified. You may continue your membership application.";

                applicationResendButton.hidden = true;
                applicationRefreshButton.hidden = true;

                return;

            }


            applicationVerificationHeading.textContent =
                "Email Verification Pending";

            document.getElementById(
                "applicationEmailStatus"
            ).textContent = "Verification Pending";

            applicationVerificationMessage.textContent =
                verificationState === "failed"
                    ? "Your account has been created, but we couldn't send the verification email. You can request another verification email here or from the Login page. You may begin your membership application now, but your email must be verified before it can be submitted."
                    : "Your account has been created. We sent a verification email to your email address. You may begin your membership application now, but your email must be verified before the application can be submitted.";

            applicationResendButton.hidden = false;
            applicationRefreshButton.hidden = false;

        };


    saveApplicationDraftButton.addEventListener(
        "click",
        async () => {

            if (!applicationUser) return;

            if (currentApplication && currentApplication.applicationStatus !== "Draft") {
                applicationFormMessage.textContent =
                    "This application is no longer editable.";
                return;
            }

            applicationFormMessage.textContent = "Saving your draft...";


            try {
                const selectedType = applicationMembershipType.value;
                membershipConfig = await loadMembershipConfig();
                renderMembershipTypeCards(selectedType);
                const draftData = buildApplicationWriteData("Draft");
                await setDoc(
                    doc(db, "membershipApplications", applicationUser.uid),
                    draftData
                );
                currentApplication = draftData;
                document.getElementById("applicationStatus").textContent = "Draft";
                applicationFormMessage.textContent =
                    "Your application draft has been saved.";
            } catch (error) {
                console.error("Application draft could not be saved.", error);
                applicationFormMessage.textContent =
                    "We couldn't save your draft. Please try again.";
            }

        }
    );


    membershipApplicationForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();
            const user = auth.currentUser;

            if (!user) {
                window.location.href = "login.html";
                return;
            }

            if (currentApplication && currentApplication.applicationStatus !== "Draft") {
                applicationFormMessage.textContent =
                    "This application has already been submitted and cannot be edited.";
                return;
            }

            try {
                await user.reload();
                if (user.emailVerified) {
                    await user.getIdToken(true);
                }
            } catch (error) {
                console.error("Email verification could not be checked before submission.", error);
            }

            if (selectedSponsorUserId && !sponsorRequested) {
                try {
                    const sponsorSnapshot = await getDoc(
                        doc(db, "memberProfiles", selectedSponsorUserId)
                    );
                    sponsorProfiles = sponsorProfiles.filter(
                        (profile) => profile.uid !== selectedSponsorUserId
                    );
                    if (sponsorSnapshot.exists()) {
                        sponsorProfiles.push({
                            ...sponsorSnapshot.data(),
                            uid: sponsorSnapshot.id,
                            documentId: sponsorSnapshot.id
                        });
                    }
                } catch (error) {
                    console.error("Sponsor eligibility could not be refreshed.", error);
                    applicationFormMessage.textContent =
                        "We couldn't verify the selected sponsor's current eligibility. Please try again.";
                    return;
                }
            }

            const selectedType = applicationMembershipType.value;
            membershipConfig = await loadMembershipConfig();
            renderMembershipTypeCards(selectedType);

            renderApplicationVerificationState(user);
            const submissionData = buildApplicationWriteData("Submitted");
            const validationMessage =
                validateMembershipApplicationSubmission(submissionData, user);

            if (validationMessage) {
                applicationFormMessage.textContent = validationMessage;
                return;
            }

            applicationFormMessage.textContent = "Submitting your application...";

            try {
                await setDoc(
                    doc(db, "membershipApplications", user.uid),
                    submissionData
                );
                currentApplication = submissionData;
                document.getElementById("applicationStatus").textContent = "Submitted";
                applicationFormMessage.textContent =
                    "Your application has been submitted for review.";
                setApplicationReadOnly(true);
            } catch (error) {
                console.error("Application could not be submitted.", error);
                applicationFormMessage.textContent =
                    "We couldn't submit your application. Your information is still available on this page; please try again.";
            }

        }
    );


    applicationResendButton.addEventListener(
        "click",
        async () => {

            const user = auth.currentUser;


            if (!user) {
                window.location.href = "login.html";
                return;
            }


            if (user.emailVerified) {
                renderApplicationVerificationState(user);
                return;
            }


            applicationVerificationMessage.textContent =
                "Sending a new verification email...";


            try {

                await sendVerificationEmail(
                    user,
                    "membership application resend"
                );

                verificationState = "sent";
                window.history.replaceState(
                    {},
                    "",
                    "membership-application.html?verification=sent"
                );

                applicationVerificationMessage.textContent =
                    "A new verification email has been sent. You may continue working on your application while you verify your email.";

            } catch (error) {

                applicationVerificationMessage.textContent =
                    "We couldn't send the verification email. Please try again later or use the resend option on the Login page.";

            }

        }
    );


    applicationRefreshButton.addEventListener(
        "click",
        async () => {

            const user = auth.currentUser;


            if (!user) {
                window.location.href = "login.html";
                return;
            }


            try {

                await user.reload();
                renderApplicationVerificationState(user);

                if (!user.emailVerified) {
                    applicationVerificationMessage.textContent =
                        "Your email is still awaiting verification. You may continue working on your application in the meantime.";
                }

            } catch (error) {

                console.error(
                    "Application verification status could not be refreshed.",
                    error
                );

                applicationVerificationMessage.textContent =
                    "We couldn't refresh your verification status. Please try again.";

            }

        }
    );


    onAuthStateChanged(
        auth,
        async (authenticatedUser) => {

            if (!authenticatedUser) {
                window.location.replace("login.html");
                return;
            }


            try {
                await authenticatedUser.reload();
            } catch (error) {
                console.error(
                    "Application verification status could not be loaded.",
                    error
                );
            }


            const refreshedApplicationUser =
                auth.currentUser || authenticatedUser;


            if (refreshedApplicationUser.emailVerified) {
                try {
                    const applicationRoute =
                        await getPostLoginRoute(refreshedApplicationUser);

                    if (applicationRoute.destination !== "membership-application.html") {
                        redirectToPage(
                            applicationRoute.destination,
                            "membership-application-route-guard",
                            {
                                authenticatedUser: refreshedApplicationUser,
                                authorization: applicationRoute.authorization,
                                memberRecordExists: applicationRoute.memberRecordExists
                            }
                        );
                        return;
                    }
                } catch (error) {
                    console.error(
                        "Membership application routing could not be determined.",
                        error
                    );
                }
            }


            renderApplicationVerificationState(
                refreshedApplicationUser
            );

            applicationUser =
                refreshedApplicationUser;


            try {
                const applicationRef =
                    doc(
                        db,
                        "membershipApplications",
                        applicationUser.uid
                    );

                const [applicationSnapshot, userSnapshot, memberProfilesSnapshot, loadedMembershipConfig] =
                    await Promise.all([
                        getDoc(applicationRef),
                        getDoc(doc(db, "users", applicationUser.uid)),
                        getDocs(collection(db, "memberProfiles")),
                        loadMembershipConfig()
                    ]);

                membershipConfig = loadedMembershipConfig;

                currentApplication = applicationSnapshot.exists()
                    ? applicationSnapshot.data()
                    : null;

                const userData = userSnapshot.exists()
                    ? userSnapshot.data()
                    : {};

                sponsorProfiles = memberProfilesSnapshot.docs.map((profileSnapshot) => ({
                    ...profileSnapshot.data(),
                    uid: profileSnapshot.id,
                    documentId: profileSnapshot.id
                }));

                populateApplicationForm(
                    currentApplication,
                    userData,
                    applicationUser
                );

                const applicationStatus =
                    currentApplication?.applicationStatus || "Draft";

                document.getElementById("applicationStatus").textContent =
                    applicationStatus;

                if (applicationStatus !== "Draft") {
                    setApplicationReadOnly(true);
                    applicationFormMessage.textContent =
                        applicationStatus === "Submitted"
                            ? "Your application has been submitted for review."
                            : `Your application status is ${applicationStatus}. This application is read-only.`;
                }

            } catch (error) {
                console.error("Membership application could not be loaded.", error);
                applicationFormMessage.textContent =
                    "We couldn't load your saved application. Please refresh and try again.";
                setApplicationReadOnly(true);
            }

            membershipApplicationPage.hidden = false;

            document.getElementById(
                "membershipApplicationAccessMessage"
            ).hidden = true;

        }
    );

}


// ------------------------------------
// Membership Status / Progress
// ------------------------------------

const membershipProgress =
    document.getElementById("membershipProgress");


if (membershipProgress) {

    onAuthStateChanged(auth, async (authenticatedUser) => {
        if (!authenticatedUser) {
            window.location.replace("login.html");
            return;
        }

        try {
            await authenticatedUser.reload();
            const currentUser = auth.currentUser || authenticatedUser;
            const route = await getPostLoginRoute(currentUser);

            if (route.destination !== "membership-status.html") {
                redirectToPage(route.destination, "membership-status-route-guard", {
                    authenticatedUser: currentUser,
                    authorization: route.authorization,
                    memberRecordExists: route.memberRecordExists
                });
                return;
            }

            const membershipStatus = route.userData.membershipStatus || "";
            const applicationStatus = route.applicationData?.applicationStatus || "";
            const heading = document.getElementById("membershipProgressHeading");
            const message = document.getElementById("membershipProgressMessage");
            const nextStep = document.getElementById("membershipProgressNextStepMessage");

            document.getElementById("progressApplicationStatus").textContent =
                applicationStatus || "No Application";
            document.getElementById("progressMembershipStatus").textContent =
                membershipStatus || "No Current Membership";
            document.getElementById("progressSponsorStatusDetail").hidden =
                route.applicationData?.sponsorRequested !== true;

            if (membershipStatus === "Pending Dues") {
                heading.textContent = "Application Approved — Membership Dues Pending";
                message.textContent = "Your application has been approved. Your membership will become Active after the required dues step is completed.";
                nextStep.textContent = "Online dues and payment functionality will be added later. The WBA will provide further instructions.";
            } else if (membershipStatus === "Past Due" || membershipStatus === "Archived") {
                heading.textContent = "Membership Inactive";
                message.textContent = "Your WBA membership is currently inactive.";
                nextStep.textContent = "Renewal and reactivation options will be added in a future update.";
            } else if (membershipStatus === "Suspended" || membershipStatus === "Expelled") {
                heading.textContent = "Membership Access Restricted";
                message.textContent = "Your WBA membership is not currently eligible for Member Portal access.";
                nextStep.textContent = "Please contact the WBA if you need assistance with your membership status.";
            } else if (applicationStatus === "Declined") {
                heading.textContent = "Application Declined";
                message.textContent = "Your membership application is no longer under review.";
                nextStep.textContent = "Reapplication options are not available in the portal yet.";
            } else if (applicationStatus === "Withdrawn") {
                heading.textContent = "Application Withdrawn";
                message.textContent = "This membership application has been withdrawn.";
                nextStep.textContent = "Reapplication options are not available in the portal yet.";
            } else if (applicationStatus === "Approved") {
                heading.textContent = "Application Approved";
                message.textContent = "Your membership application has been approved, but your membership is not Active yet.";
                nextStep.textContent = "The WBA will provide information about the remaining membership steps.";
            } else if (applicationStatus === "Awaiting Board Decision") {
                heading.textContent = "Application Under Board Review";
                message.textContent = "Your application has completed its initial review and is awaiting a Board decision.";
                nextStep.textContent = "No action is required while the Board reviews your application.";
            } else if (applicationStatus === "Submitted") {
                heading.textContent = "Application Submitted — Awaiting Initial Review";
                message.textContent = "Your application has been submitted and is awaiting its initial completeness review.";
                nextStep.textContent = route.applicationData?.sponsorRequested === true
                    ? "Sponsor Request Pending: the WBA is working to help identify an eligible sponsor."
                    : "No action is required while your application is reviewed.";
            } else if (membershipStatus === "Pending Application") {
                heading.textContent = "Membership Application Pending";
                message.textContent = applicationStatus === "Draft"
                    ? "Your membership application is still in progress."
                    : "Your membership application is awaiting the next review step.";
                nextStep.textContent = "Return here for updates about your application progress.";
            } else {
                heading.textContent = "Application in Progress";
                message.textContent = "Your application has been submitted and is awaiting review.";
                nextStep.textContent = route.applicationData?.sponsorRequested === true
                    ? "Sponsor Request Pending: the WBA is working to help identify an eligible sponsor."
                    : "No action is required while your application is being reviewed.";
            }

            membershipProgress.hidden = false;
            document.getElementById("membershipStatusAccessMessage").hidden = true;
        } catch (error) {
            console.error("Membership progress could not be loaded.", error);
            document.getElementById("membershipStatusAccessMessage").textContent =
                "We couldn't load your membership progress. Please try again.";
        }
    });

}

// ------------------------------------
// Login
// ------------------------------------

const loginForm =
    document.getElementById("loginForm");


if (loginForm) {

    const message =
        document.getElementById("message");

    const verificationOptions =
        document.getElementById("verificationOptions");

    const resendVerificationButton =
        document.getElementById("resendVerificationButton");

    const refreshVerificationButton =
        document.getElementById("refreshVerificationButton");


    loginForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            const email =
                document.getElementById("email").value.trim();

            const password =
                document.getElementById("password").value;


            message.textContent = "";

            verificationOptions.style.display =
                "none";


            try {

                const userCredential =
                    await signInWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                const user =
                    userCredential.user;


                if (!user.emailVerified) {

                    message.textContent =
                        "Your account is valid, but your email address has not been verified yet.";

                    verificationOptions.style.display =
                        "block";

                    return;
                }


                const authorization = await getAdminAuthorization(user);
                const isSystemSuperAdmin =
                    authorization?.active === true && authorization?.superAdmin === true;

                if (!isSystemSuperAdmin) {
                    const userRef = doc(db, "users", user.uid);
                    const userSnapshot = await getDoc(userRef);

                    if (!userSnapshot.exists()) {
                        await setDoc(userRef, {
                            email: user.email,
                            profileCompleted: false,
                            createdAt: new Date().toISOString()
                        });
                        console.log("New user profile created in Firestore.");
                    } else {
                        console.log("Existing user profile found in Firestore.");
                    }
                } else {
                    console.log("Super Admin system account authenticated without member-profile creation.");
                }


                await routeAuthenticatedUser(user);

            } catch (error) {

                console.error(error);


                message.textContent =
                    "We couldn't log you in. Please check your email address and password.";

            }

        }
    );


    // --------------------------------
    // Resend Verification
    // --------------------------------

    if (resendVerificationButton) {

        resendVerificationButton.addEventListener(
            "click",
            async () => {

                const user =
                    auth.currentUser;


                if (!user) {

                    message.textContent =
                        "Please log in again before requesting another verification email.";

                    return;
                }


                try {

                    await sendVerificationEmail(
                        user,
                        "manual resend"
                    );


                    message.textContent =
                        "A new verification email has been sent. Please check your email.";

                } catch (error) {

                    message.textContent =
                        "We couldn't send the verification email. Please try again later.";

                }

            }
        );

    }


    // --------------------------------
    // Check Verification Again
    // --------------------------------

    if (refreshVerificationButton) {

        refreshVerificationButton.addEventListener(
            "click",
            async () => {

                const user =
                    auth.currentUser;


                if (!user) {

                    message.textContent =
                        "Please log in again.";

                    return;
                }


                await user.reload();


                if (user.emailVerified) {

                    message.textContent =
                        "Your email has been verified.";

                    verificationOptions.style.display =
                        "none";

                } else {

                    message.textContent =
                        "Your email is still not verified. Please use the link in the verification email.";

                }

            }
        );

    }

}


// ------------------------------------
// Forgot Password
// ------------------------------------

const forgotPasswordLink =
    document.getElementById("forgotPasswordLink");


if (forgotPasswordLink) {

    forgotPasswordLink.addEventListener(
        "click",
        async (event) => {

            event.preventDefault();


            const email =
                document.getElementById("email").value.trim();

            const message =
                document.getElementById("message");


            if (!email) {

                message.textContent =
                    "Enter your email address first, then select Forgot your password.";

                return;
            }


            try {

                await sendPasswordResetEmail(
                    auth,
                    email
                );


                message.textContent =
                    "If an account exists for that email address, a password reset email has been sent.";

            } catch (error) {

                console.error(error);


                message.textContent =
                    "We couldn't process the password reset request. Please try again.";

            }

        }
    );

}


console.log("WBA Member Portal loaded.");


// ------------------------------------
// Member-Readable Profile Data
// ------------------------------------

const buildDisplayLocation =
    (profileData, visibility) => {

        const locationParts = {
            full: [
                profileData.address,
                profileData.city,
                profileData.subdivisionName || profileData.state,
                profileData.zip,
                profileData.countryName || profileData.country
            ],
            cityState: [
                profileData.city,
                profileData.subdivisionName || profileData.state
            ],
            state: [
                profileData.subdivisionName || profileData.state
            ],
            country: [
                profileData.countryName || profileData.country
            ]
        };

        const selectedParts =
            locationParts[visibility];


        if (!selectedParts) {
            return "";
        }


        return selectedParts
            .filter(Boolean)
            .join(", ");

    };


const getMemberFacingStatus =
    (membershipStatus) => {

        const normalizedStatus =
            String(membershipStatus || "")
                .trim()
                .toLocaleLowerCase();


        if (
            normalizedStatus === "active" ||
            normalizedStatus === "renewals pending"
        ) {
            return "Active";
        }


        const inactiveStatuses = [
            "inactive",
            "archived",
            "expired",
            "lapsed",
            "past due",
            "resigned",
            "suspended",
            "expelled"
        ];


        if (inactiveStatuses.includes(normalizedStatus)) {
            return "Inactive";
        }


        return "No Membership";

    };


const buildMemberProfileData =
    (uid, sourceData) => {

        const privacy =
            sourceData.privacy || {};

        const firstName =
            sourceData.firstName || "";

        const lastName =
            sourceData.lastName || "";

        const preferredNameIsVisible =
            privacy.preferredName !== "private";

        const preferredName =
            preferredNameIsVisible
                ? sourceData.preferredName || ""
                : "";

        const locationVisibility =
            privacy.location || "state";

        const memberProfileData = {
            uid,
            firstName,
            lastName,
            displayName:
                `${preferredName || firstName} ${lastName}`
                    .trim(),
            locationVisibility,
            aboutVisibility:
                privacy.about || "members",
            wbaRoles:
                Array.isArray(sourceData.wbaRoles)
                    ? sourceData.wbaRoles
                        .map((role) =>
                            typeof role === "string"
                                ? role
                                : role?.name
                        )
                        .filter(Boolean)
                    : [],
            membershipStatus:
                getMemberFacingStatus(
                    sourceData.membershipStatus
                ),
            sponsorEligible:
                sourceData.membershipStatus === "Active",
            dogSports:
                Array.isArray(sourceData.dogSports)
                    ? sourceData.dogSports.filter(
                        (sportId) =>
                            DOG_SPORT_IDS.has(sportId)
                    )
                    : [],
            updatedAt:
                sourceData.updatedAt ||
                new Date().toISOString()
        };

        const copyIfPresent =
            (fieldName, value) => {

                if (
                    value !== undefined &&
                    value !== null &&
                    value !== ""
                ) {

                    memberProfileData[fieldName] =
                        value;

                }

            };


        if (preferredNameIsVisible) {

            copyIfPresent(
                "preferredName",
                preferredName
            );

        }


        copyIfPresent(
            "profilePhotoPath",
            sourceData.profilePhotoPath
        );

        copyIfPresent(
            "profilePhotoUpdatedAt",
            sourceData.profilePhotoUpdatedAt
        );

        copyIfPresent(
            "memberId",
            sourceData.memberId ||
            sourceData.memberNumber
        );

        copyIfPresent(
            "membershipType",
            sourceData.membershipType
        );

        copyIfPresent(
            "membershipStartDate",
            sourceData.membershipStartDate ||
            sourceData.memberSince
        );

        copyIfPresent(
            "membershipCurrentThrough",
            sourceData.membershipCurrentThrough ||
            sourceData.renewalDate
        );


        if (privacy.email === "members") {

            copyIfPresent(
                "email",
                sourceData.email
            );

        }


        if (privacy.phone === "members") {

            copyIfPresent(
                "phone",
                sourceData.phone
            );

        }


        if (privacy.about === "members") {

            copyIfPresent(
                "about",
                sourceData.about
            );

        }


        const displayLocation =
            buildDisplayLocation(
                sourceData,
                locationVisibility
            );


        copyIfPresent(
            "location",
            displayLocation
        );


        return memberProfileData;

    };


// ------------------------------------
// Member Dashboard
// ------------------------------------

const memberDashboard =
    document.getElementById(
        "memberDashboard"
    );


if (memberDashboard) {

    const dashboardMessage =
        document.getElementById(
            "dashboardMessage"
        );


    onAuthStateChanged(
        auth,
        async (authenticatedUser) => {

            if (
                !authenticatedUser ||
                !authenticatedUser.emailVerified
            ) {

                window.location.href =
                    "login.html";

                return;

            }


            try {

                const dashboardRoute =
                    await getPostLoginRoute(
                        authenticatedUser
                    );


                if (dashboardRoute.destination !== "dashboard.html") {
                    redirectToPage(
                        dashboardRoute.destination,
                        "member-dashboard-route-guard",
                        {
                            authenticatedUser,
                            authorization: dashboardRoute.authorization,
                            memberRecordExists: dashboardRoute.memberRecordExists
                        }
                    );
                    return;
                }


                const dashboardProfileData =
                    dashboardRoute.userData;


                const adminDashboardCard =
                    document.getElementById(
                        "adminDashboardCard"
                    );


                if (adminDashboardCard) {

                    try {

                        adminDashboardCard.hidden =
                            !await isAuthorizedAdmin(
                                authenticatedUser
                            );

                    } catch (error) {

                        console.error(
                            "Admin authorization could not be checked.",
                            error
                        );

                        adminDashboardCard.hidden = true;

                    }

                }

                const dashboardDisplayName =
                    `${dashboardProfileData.preferredName || dashboardProfileData.firstName || ""} ${dashboardProfileData.lastName || ""}`
                        .trim() ||
                    "WBA Member";

                const dashboardInitials =
                    `${(dashboardProfileData.firstName || "").charAt(0)}${(dashboardProfileData.lastName || "").charAt(0)}`
                        .toUpperCase() ||
                    "WBA";


                document.getElementById(
                    "dashboardDisplayName"
                ).textContent =
                    dashboardDisplayName;

                document.getElementById(
                    "dashboardInitials"
                ).textContent =
                    dashboardInitials;

                document.getElementById(
                    "dashboardMembershipStatus"
                ).textContent =
                    dashboardProfileData.membershipStatus ||
                    "No Membership";


                if (dashboardProfileData.profilePhotoPath) {

                    const dashboardPhoto =
                        document.getElementById(
                            "dashboardPhoto"
                        );

                    const dashboardPhotoPlaceholder =
                        document.getElementById(
                            "dashboardPhotoPlaceholder"
                        );


                    try {

                        const photoRef =
                            ref(
                                storage,
                                dashboardProfileData.profilePhotoPath
                            );

                        const photoURL =
                            new URL(
                                await getDownloadURL(photoRef)
                            );


                        if (dashboardProfileData.profilePhotoUpdatedAt) {

                            photoURL.searchParams.set(
                                "updatedAt",
                                dashboardProfileData.profilePhotoUpdatedAt
                            );

                        }


                        dashboardPhoto.onerror = () => {

                            dashboardPhoto.style.display =
                                "none";

                            dashboardPhotoPlaceholder.style.display =
                                "flex";

                        };

                        dashboardPhoto.src =
                            photoURL.toString();

                        dashboardPhoto.style.display =
                            "block";

                        dashboardPhotoPlaceholder.style.display =
                            "none";

                    } catch (error) {

                        console.error(
                            "Dashboard profile photo could not be loaded.",
                            error
                        );

                    }

                }


                dashboardMessage.textContent =
                    "";

            } catch (error) {

                console.error(error);

                dashboardMessage.textContent =
                    "We couldn't load your dashboard. Please try again.";

            }

        }
    );

}


// ------------------------------------
// Admin Dashboard
// ------------------------------------

const adminDashboard =
    document.getElementById(
        "adminDashboard"
    );


if (adminDashboard) {

    const adminAccessMessage =
        document.getElementById(
            "adminAccessMessage"
        );


    onAuthStateChanged(
        auth,
        async (authenticatedUser) => {

            if (
                !authenticatedUser ||
                !authenticatedUser.emailVerified
            ) {

                window.location.replace(
                    "login.html"
                );

                return;

            }


            let authorization;
            let memberRecordExists = false;
            try {
                authorization = await getAdminAuthorization(authenticatedUser);
            } catch (error) {
                console.error("Admin authorization could not be verified.", error);
                redirectToPage("dashboard.html", "admin-authorization-read-failed", {
                    authenticatedUser,
                    authorization: {active: false, superAdmin: false},
                    memberRecordExists: false
                });
                return;
            }

            try {
                memberRecordExists = (
                    await getDoc(doc(db, "users", authenticatedUser.uid))
                ).exists();
            } catch (error) {
                console.warn("[Routing] Admin member-record diagnostic read failed.", error);
            }

            if (authorization.active !== true) {
                redirectToPage("dashboard.html", "inactive-or-missing-admin-authorization", {
                    authenticatedUser,
                    authorization,
                    memberRecordExists
                });
                return;
            }

            logRoutingDecision({
                authenticatedUser,
                authorization,
                memberRecordExists,
                decision: "allow-admin",
                reason: "active-admin-authorization"
            });
            adminDashboard.hidden = false;
            adminAccessMessage.textContent = "";
            const superAdminIndicator = document.getElementById("superAdminIndicator");
            if (superAdminIndicator) {
                superAdminIndicator.hidden = authorization.superAdmin !== true;
            }

            try {
                const [adminApplicationsData, adminMemberAccounts] = await Promise.all([
                    loadAdminApplications(),
                    loadAdminMemberAccounts()
                ]);
                const pendingCount = adminApplicationsData.filter(
                    (applicationData) => applicationData.applicationStatus === "Submitted"
                ).length;
                const awaitingBoardCount = adminApplicationsData.filter(
                    (applicationData) => applicationData.applicationStatus === "Awaiting Board Decision"
                ).length;
                const countElement = document.getElementById("adminPendingApplicationCount");
                if (countElement) {
                    countElement.textContent =
                        `${pendingCount} Pending Review · ${awaitingBoardCount} Awaiting Board`;
                }
                const duesAttentionCount = adminMemberAccounts.filter(
                    (memberData) => DUES_ATTENTION_STATUSES.has(memberData.membershipStatus)
                ).length;
                const duesCountElement = document.getElementById("adminDuesAttentionCount");
                if (duesCountElement) {
                    duesCountElement.textContent = duesAttentionCount === 0
                        ? "No accounts currently need dues attention."
                        : duesAttentionCount === 1
                            ? "1 account needs dues attention."
                            : `${duesAttentionCount} accounts need dues attention.`;
                    duesCountElement.classList.toggle(
                        "has-attention",
                        duesAttentionCount > 0
                    );
                }
            } catch (error) {
                console.error("Admin dashboard summary data could not be loaded.", error);
                adminAccessMessage.textContent =
                    "Admin access is active, but dashboard counts could not be loaded. You can still use the Admin tools below.";
            }

        }
    );

}


// ------------------------------------
// Admin Application Review
// ------------------------------------

const formatApplicationDate = (value) => {
    if (!value) return "—";
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime())
        ? String(value)
        : new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        }).format(date);
};

const getApplicationMembershipYear = (applicationData) => {
    if (Number.isInteger(applicationData?.membershipYear)) {
        return applicationData.membershipYear;
    }
    const submittedDate = new Date(applicationData?.submittedAt || "");
    return Number.isNaN(submittedDate.getTime())
        ? null
        : submittedDate.getFullYear();
};

const getApplicationApplicantName = (applicationData) =>
    `${applicationData?.preferredName || applicationData?.firstName || ""} ${applicationData?.lastName || ""}`.trim() ||
    "Unnamed Applicant";

const getSponsorReviewState = (applicationData, memberAccountsByUid) => {
    if (applicationData?.sponsorRequested === true) {
        return {
            code: "request",
            label: "Needs Sponsor",
            reason: "The applicant requested help finding a sponsor."
        };
    }

    const sponsorUid = applicationData?.sponsorUserId;
    if (typeof sponsorUid !== "string") {
        return {
            code: "malformed",
            label: "Sponsor Needs Review",
            reason: "The selected sponsor reference is missing or malformed."
        };
    }
    if (sponsorUid === applicationData?.applicantUid) {
        return {
            code: "self",
            label: "Sponsor Needs Review",
            reason: "The applicant appears to reference their own account as sponsor."
        };
    }

    const sponsor = memberAccountsByUid.get(sponsorUid);
    if (!sponsor) {
        return {
            code: "missing",
            label: "Sponsor Needs Review",
            reason: "The selected sponsor could not be verified as a current WBA member."
        };
    }
    if (sponsor.membershipStatus !== "Active") {
        return {
            code: "inactive",
            label: "Sponsor Needs Review",
            reason: "The selected sponsor is no longer an Active WBA member."
        };
    }

    return { code: "valid", label: "Valid Sponsor", reason: "" };
};

const adminApplications = document.getElementById("adminApplications");

if (adminApplications) {
    const accessMessage = document.getElementById("adminApplicationsAccessMessage");
    const list = document.getElementById("adminApplicationList");
    const message = document.getElementById("adminApplicationsMessage");
    const filter = document.getElementById("applicationStatusFilter");
    let loadedApplications = [];
    let memberAccountsByUid = new Map();

    const renderApplications = () => {
        const selectedStatus = filter.value;
        const filtered = loadedApplications
            .filter((applicationData) => selectedStatus === "Reviewed"
                ? ["Approved", "Declined"].includes(applicationData.applicationStatus)
                : applicationData.applicationStatus === selectedStatus)
            .sort((first, second) => {
                const firstTime = Date.parse(first.submittedAt || "") || 0;
                const secondTime = Date.parse(second.submittedAt || "") || 0;
                return firstTime - secondTime;
            });

        list.replaceChildren();
        filtered.forEach((applicationData) => {
            const sponsorReview = getSponsorReviewState(
                applicationData,
                memberAccountsByUid
            );
            const card = document.createElement("article");
            card.className = "admin-application-card";
            const heading = document.createElement("h3");
            heading.textContent = getApplicationApplicantName(applicationData);
            const details = document.createElement("dl");
            const rows = [
                ["Membership Type", applicationData.membershipType || "—"],
                ["Membership Year", getApplicationMembershipYear(applicationData) || "—"],
                ["Submitted", formatApplicationDate(applicationData.submittedAt)],
                ["Sponsor", applicationData.sponsorRequested === true
                    ? "Needs Sponsor"
                    : applicationData.sponsorDisplayName
                        ? `Sponsored by ${applicationData.sponsorDisplayName}`
                        : "Sponsor not recorded"],
                ["Sponsorship Review", sponsorReview.label],
                ["Status", applicationData.applicationStatus]
            ];
            rows.forEach(([term, value]) => {
                const dt = document.createElement("dt");
                const dd = document.createElement("dd");
                dt.textContent = term;
                dd.textContent = String(value);
                details.append(dt, dd);
            });
            if (sponsorReview.code !== "valid") card.classList.add("needs-sponsor");
            const link = document.createElement("a");
            link.href = `admin-application.html?id=${encodeURIComponent(applicationData.applicantUid)}`;
            link.textContent = "View Application";
            link.className = "admin-manage-link";
            card.append(heading, details, link);
            list.appendChild(card);
        });
        message.textContent = filtered.length
            ? `${filtered.length} application${filtered.length === 1 ? "" : "s"}.`
            : "No applications match this status.";
    };

    filter.addEventListener("change", renderApplications);
    onAuthStateChanged(auth, async (authenticatedUser) => {
        if (!authenticatedUser?.emailVerified) {
            window.location.replace("login.html");
            return;
        }
        try {
            if (!await isAuthorizedAdmin(authenticatedUser)) {
                window.location.replace("dashboard.html");
                return;
            }
            const [applications, memberAccounts] = await Promise.all([
                loadAdminApplications(),
                loadAdminMemberAccounts()
            ]);
            memberAccountsByUid = new Map(
                memberAccounts.map((memberData) => [memberData.uid, memberData])
            );
            loadedApplications = applications
                .filter((applicationData) =>
                    ["Submitted", "Awaiting Board Decision", "Approved", "Declined"].includes(applicationData.applicationStatus)
                );
            renderApplications();
            adminApplications.hidden = false;
            accessMessage.textContent = "";
        } catch (error) {
            console.error("Admin applications could not be loaded.", error);
            accessMessage.textContent = "We couldn't load the applications.";
        }
    });
}

const adminApplicationDetail = document.getElementById("adminApplicationDetail");

if (adminApplicationDetail) {
    const accessMessage = document.getElementById("adminApplicationAccessMessage");
    const sections = document.getElementById("adminApplicationSections");
    const reviewFlag = document.getElementById("adminApplicationReviewFlag");
    const sponsorPanel = document.getElementById("adminSponsorAssignment");
    const sponsorSearch = document.getElementById("adminSponsorSearch");
    const sponsorResults = document.getElementById("adminSponsorResults");
    const actions = document.getElementById("adminReviewActions");
    const sendToBoardReviewButton = document.getElementById("sendToBoardReviewButton");
    const boardDecisionControls = document.getElementById("boardDecisionControls");
    const decisionHelp = document.getElementById("adminDecisionHelp");
    const message = document.getElementById("adminApplicationMessage");
    const applicantUid = new URLSearchParams(window.location.search).get("id")?.trim() || "";
    let applicationData = null;
    let applicantData = null;
    let activeSponsors = [];
    let memberAccountsByUid = new Map();
    let adminUser = null;

    const yesNo = (value) => value === true ? "Yes" : value === false ? "No" : "—";
    const renderSection = (title, rows) => {
        const section = document.createElement("section");
        section.className = "admin-application-section";
        const heading = document.createElement("h3");
        heading.textContent = title;
        const details = document.createElement("dl");
        rows.filter(([, value]) => value !== undefined).forEach(([label, value]) => {
            const dt = document.createElement("dt");
            const dd = document.createElement("dd");
            dt.textContent = label;
            dd.textContent = value === "" || value === null ? "—" : String(value);
            details.append(dt, dd);
        });
        section.append(heading, details);
        sections.appendChild(section);
    };

    const renderApplication = () => {
        sections.replaceChildren();
        const membershipYear = getApplicationMembershipYear(applicationData);
        const juniorAge = applicationData.membershipType === "Junior" && membershipYear
            ? getAgeOnJanuaryFirst(applicationData.dateOfBirth, membershipYear)
            : null;
        const sportLabels = Array.isArray(applicationData.dogSports)
            ? applicationData.dogSports.map((id) => DOG_SPORT_LABELS.get(id) || id).join(", ")
            : "—";
        document.getElementById("adminApplicationApplicantName").textContent =
            getApplicationApplicantName(applicationData);
        renderSection("Application Information", [
            ["Application Status", applicationData.applicationStatus],
            ["Submitted Date", formatApplicationDate(applicationData.submittedAt)],
            ["Sent to Board", applicationData.adminReviewedAt ? formatApplicationDate(applicationData.adminReviewedAt) : undefined],
            ["Reviewed Date", applicationData.reviewedAt ? formatApplicationDate(applicationData.reviewedAt) : undefined],
            ["Decline Reason (Admin-only)", applicationData.applicationStatus === "Declined" ? applicationData.declineReason : undefined],
            ["Membership Year", membershipYear || "—"],
            ["Membership Type", applicationData.membershipType],
            ["Dues Amount at Submission", typeof applicationData.membershipDuesAmount === "number" ? `$${applicationData.membershipDuesAmount}` : "—"],
            ...(applicationData.membershipType === "Junior" ? [
                ["Age on January 1", juniorAge ?? "Unable to calculate"],
                ["Junior Eligibility", juniorAge !== null && juniorAge >= 10 && juniorAge <= 18 ? "Eligible" : "Not eligible"]
            ] : []),
            ["Residence Classification", ["US", "CA"].includes(applicationData.countryCode) ? "United States / Canada" : "Foreign"]
        ]);
        renderSection("Personal Information", [["First Name", applicationData.firstName], ["Last Name", applicationData.lastName], ["Preferred Name", applicationData.preferredName], ["Email", applicationData.email], ["Phone", applicationData.phone], ["Date of Birth", applicationData.dateOfBirth]]);
        renderSection("Address", [["Country", applicationData.countryName || applicationData.country], ["State / Province / Region", applicationData.subdivisionName || applicationData.state], ["Street Address", applicationData.address], ["City", applicationData.city], ["ZIP / Postal Code", applicationData.zip]]);
        renderSection("Sponsor", [["Sponsor Status", applicationData.sponsorRequested === true ? "Sponsor Request Pending" : applicationData.sponsorDisplayName ? `Sponsored by ${applicationData.sponsorDisplayName}` : "No sponsor recorded"], ["Assigned At", formatApplicationDate(applicationData.sponsorAssignedAt)]]);
        renderSection("Agreements", [["Bylaws Accepted", yesNo(applicationData.bylawsAccepted)], ["Code of Ethics Accepted", yesNo(applicationData.codeOfEthicsAccepted)], ["Communications Consent", yesNo(applicationData.communicationsConsent)]]);
        renderSection("Animal Organizations", [["Organizations", applicationData.animalOrganizations]]);
        renderSection("Discipline History", [["History", yesNo(applicationData.disciplineHistory)], ["Explanation", applicationData.disciplineHistory === true ? applicationData.disciplineExplanation : undefined]]);
        renderSection("Beauceron Ownership", [["Currently Owns a Beauceron", yesNo(applicationData.ownsBeauceron)]]);
        renderSection("Dog Sports & Activities", [["Current Activities", sportLabels || "None selected"]]);

        const isSubmitted = applicationData.applicationStatus === "Submitted";
        const isAwaitingBoard = applicationData.applicationStatus === "Awaiting Board Decision";
        const sponsorReview = getSponsorReviewState(
            applicationData,
            memberAccountsByUid
        );
        const sponsorNeedsResolution = sponsorReview.code !== "valid";
        reviewFlag.hidden = !sponsorNeedsResolution;
        reviewFlag.textContent = sponsorNeedsResolution
            ? `${sponsorReview.label}: ${sponsorReview.reason}`
            : "";
        sponsorPanel.hidden = !(isSubmitted || isAwaitingBoard) || !sponsorNeedsResolution;
        actions.hidden = !(isSubmitted || isAwaitingBoard);
        sendToBoardReviewButton.hidden = !isSubmitted;
        boardDecisionControls.hidden = !isAwaitingBoard;
        decisionHelp.textContent = isSubmitted
            ? "Confirm the application is complete and ready before sending it to the Board."
            : isAwaitingBoard
                ? "Record the Board's final decision after it has been made outside the portal."
                : "";
    };

    const validateApplicationReadiness = async () => {
        if (applicationData.sponsorRequested || !applicationData.sponsorUserId) return "Assign an Active WBA sponsor before continuing this application.";
        if (applicationData.sponsorUserId === applicantUid) {
            return "The applicant appears to reference their own account as sponsor. Please assign another sponsor before sending this application to the Board.";
        }
        const sponsorSnapshot = await getDoc(doc(db, "users", applicationData.sponsorUserId));
        if (!sponsorSnapshot.exists()) {
            return "The selected sponsor could not be verified as a current WBA member. Please assign another sponsor before sending this application to the Board.";
        }
        if (sponsorSnapshot.data().membershipStatus !== "Active") {
            return "The selected sponsor is no longer an Active WBA member. Please assign another sponsor before sending this application to the Board.";
        }
        const membershipYear = getApplicationMembershipYear(applicationData);
        if (applicationData.membershipType === "Junior") {
            if (!membershipYear || !isJuniorEligible(applicationData.dateOfBirth, membershipYear)) {
                return "This applicant does not meet Junior eligibility for the application membership year.";
            }
        }
        const isForeign = !["US", "CA"].includes(applicationData.countryCode);
        if ((applicationData.membershipType === "Foreign") !== isForeign) {
            return "The membership type does not match the applicant's country classification.";
        }
        const required = ["firstName", "lastName", "email", "phone", "address", "city", "zip", "countryCode", "membershipType"];
        if (required.some((field) => !applicationData[field]) || typeof applicationData.disciplineHistory !== "boolean" || typeof applicationData.ownsBeauceron !== "boolean" || applicationData.bylawsAccepted !== true || applicationData.codeOfEthicsAccepted !== true) {
            return "This application is missing required submitted information and cannot continue.";
        }
        return "";
    };

    sponsorSearch.addEventListener("input", () => {
        const term = sponsorSearch.value.trim().toLocaleLowerCase();
        sponsorResults.replaceChildren();
        if (!term) return;
        activeSponsors.filter((sponsor) => sponsor.uid !== applicantUid)
            .filter((sponsor) => [sponsor.firstName, sponsor.lastName, sponsor.preferredName, sponsor.email].some((value) => String(value || "").toLocaleLowerCase().includes(term)))
            .slice(0, 8)
            .forEach((sponsor) => {
                const button = document.createElement("button");
                const sponsorName = `${sponsor.preferredName || sponsor.firstName || ""} ${sponsor.lastName || ""}`.trim() || sponsor.email;
                button.type = "button";
                button.textContent = sponsorName;
                button.addEventListener("click", async () => {
                    message.textContent = "Assigning sponsor...";
                    try {
                        const [refreshedSponsor, refreshedApplication] = await Promise.all([
                            getDoc(doc(db, "users", sponsor.uid)),
                            getDoc(doc(db, "membershipApplications", applicantUid))
                        ]);
                        if (!refreshedSponsor.exists() || refreshedSponsor.data().membershipStatus !== "Active") throw new Error("Sponsor is no longer Active.");
                        if (!refreshedApplication.exists() || !["Submitted", "Awaiting Board Decision"].includes(refreshedApplication.data().applicationStatus)) throw new Error("Application is no longer open for sponsor assignment.");
                        applicationData = {applicantUid, ...refreshedApplication.data()};
                        const assignedAt = new Date().toISOString();
                        const previousSponsorUserId = applicationData.sponsorUserId || null;
                        const batch = writeBatch(db);
                        batch.set(doc(db, "membershipApplications", applicantUid), {
                            sponsorUserId: sponsor.uid,
                            sponsorDisplayName: sponsorName,
                            sponsorRequested: false,
                            sponsorAssignedAt: assignedAt,
                            sponsorAssignedBy: adminUser.uid
                        }, { merge: true });
                        batch.set(createMemberHistoryRef(applicantUid), buildMemberHistoryEntry({
                            memberUid: applicantUid,
                            action: "APPLICATION_SPONSOR_ASSIGNED",
                            category: "application",
                            performedBy: adminUser.uid,
                            field: "sponsorUserId",
                            oldValue: previousSponsorUserId,
                            newValue: sponsor.uid,
                            source: "Admin Application Review"
                        }));
                        await batch.commit();
                        applicationData = { ...applicationData, sponsorUserId: sponsor.uid, sponsorDisplayName: sponsorName, sponsorRequested: false, sponsorAssignedAt: assignedAt, sponsorAssignedBy: adminUser.uid };
                        sponsorResults.replaceChildren();
                        sponsorSearch.value = "";
                        renderApplication();
                        message.textContent = "Sponsor assigned successfully.";
                    } catch (error) {
                        console.error("Sponsor could not be assigned.", error);
                        message.textContent = "The sponsor could not be assigned. Confirm the member is still Active and try again.";
                    }
                });
                sponsorResults.appendChild(button);
            });
    });

    sendToBoardReviewButton.addEventListener("click", async () => {
        message.textContent = "Validating application...";
        try {
            if (applicationData.applicationStatus !== "Submitted") {
                message.textContent = "Only Submitted applications can be sent to Board review.";
                return;
            }
            const validationMessage = await validateApplicationReadiness();
            if (validationMessage) { message.textContent = validationMessage; return; }
            if (!window.confirm("Send this completed application to Board review?")) { message.textContent = ""; return; }
            const refreshedApplication = await getDoc(doc(db, "membershipApplications", applicantUid));
            if (!refreshedApplication.exists()) throw new Error("Application no longer exists.");
            applicationData = { applicantUid, ...refreshedApplication.data() };
            if (applicationData.applicationStatus !== "Submitted") {
                renderApplication();
                message.textContent = "This application is no longer awaiting initial review.";
                return;
            }
            const finalValidationMessage = await validateApplicationReadiness();
            if (finalValidationMessage) { message.textContent = finalValidationMessage; renderApplication(); return; }
            const adminReviewedAt = new Date().toISOString();
            const batch = writeBatch(db);
            batch.set(doc(db, "membershipApplications", applicantUid), {
                applicationStatus: "Awaiting Board Decision",
                adminReviewedAt,
                adminReviewedBy: adminUser.uid
            }, { merge: true });
            batch.set(createMemberHistoryRef(applicantUid), buildMemberHistoryEntry({
                memberUid: applicantUid,
                action: "APPLICATION_SENT_TO_BOARD",
                category: "application",
                performedBy: adminUser.uid,
                field: "applicationStatus",
                oldValue: "Submitted",
                newValue: "Awaiting Board Decision",
                source: "Admin Application Review"
            }));
            await batch.commit();
            applicationData = { ...applicationData, applicationStatus: "Awaiting Board Decision", adminReviewedAt, adminReviewedBy: adminUser.uid };
            renderApplication();
            message.textContent = "Application sent to Board review. The applicant remains a non-active applicant.";
        } catch (error) {
            console.error("Application could not be sent to Board review.", error);
            message.textContent = "We couldn't send this application to Board review.";
        }
    });

    document.getElementById("recordBoardApprovalButton").addEventListener("click", async () => {
        message.textContent = "Validating application...";
        try {
            if (applicationData.applicationStatus !== "Awaiting Board Decision") {
                message.textContent = "Only applications awaiting a Board decision can receive final approval.";
                return;
            }
            const validationMessage = await validateApplicationReadiness();
            if (validationMessage) { message.textContent = validationMessage; return; }
            if (!window.confirm("The Board has approved this application. Record approval and move the applicant to Pending Dues?")) { message.textContent = ""; return; }
            const refreshedApplication = await getDoc(doc(db, "membershipApplications", applicantUid));
            applicationData = { applicantUid, ...refreshedApplication.data() };
            if (applicationData.applicationStatus !== "Awaiting Board Decision") {
                renderApplication();
                message.textContent = "This application is no longer awaiting a Board decision.";
                return;
            }
            const finalValidationMessage = await validateApplicationReadiness();
            if (finalValidationMessage) { message.textContent = finalValidationMessage; renderApplication(); return; }
            const refreshedApplicant = await getDoc(doc(db, "users", applicantUid));
            if (!refreshedApplicant.exists()) throw new Error("Applicant account no longer exists.");
            applicantData = refreshedApplicant.data();
            const reviewedAt = new Date().toISOString();
            const updatedUserData = { ...applicantData, membershipStatus: "Pending Dues", membershipUpdatedAt: reviewedAt, membershipUpdatedBy: adminUser.uid };
            const batch = writeBatch(db);
            batch.set(doc(db, "membershipApplications", applicantUid), { applicationStatus: "Approved", reviewedAt, reviewedBy: adminUser.uid }, { merge: true });
            batch.set(doc(db, "users", applicantUid), { membershipStatus: "Pending Dues", membershipUpdatedAt: reviewedAt, membershipUpdatedBy: adminUser.uid }, { merge: true });
            batch.set(doc(db, "memberProfiles", applicantUid), buildMemberProfileData(applicantUid, updatedUserData));
            batch.set(createMemberHistoryRef(applicantUid), buildMemberHistoryEntry({
                memberUid: applicantUid,
                action: "APPLICATION_APPROVED",
                category: "application",
                performedBy: adminUser.uid,
                field: "applicationStatus",
                oldValue: "Awaiting Board Decision",
                newValue: "Approved",
                source: "Admin Application Review"
            }));
            if ((applicantData.membershipStatus || null) !== "Pending Dues") {
                batch.set(createMemberHistoryRef(applicantUid), buildMemberHistoryEntry({
                    memberUid: applicantUid,
                    action: "MEMBERSHIP_STATUS_CHANGED",
                    category: "membership",
                    performedBy: adminUser.uid,
                    field: "membershipStatus",
                    oldValue: applicantData.membershipStatus || null,
                    newValue: "Pending Dues",
                    source: "Admin Application Review"
                }));
            }
            await batch.commit();
            applicationData = { ...applicationData, applicationStatus: "Approved", reviewedAt, reviewedBy: adminUser.uid };
            applicantData = updatedUserData;
            renderApplication();
            message.textContent = "Application approved. Membership status is now Pending Dues.";
        } catch (error) {
            console.error("Application approval failed.", error);
            message.textContent = "We couldn't approve this application. No approval changes were applied.";
        }
    });

    document.getElementById("recordBoardDeclineButton").addEventListener("click", async () => {
        if (applicationData.applicationStatus !== "Awaiting Board Decision") {
            message.textContent = "Only applications awaiting a Board decision can be declined.";
            return;
        }
        const declineReason = document.getElementById("adminDeclineReason").value.trim();
        if (!declineReason) { message.textContent = "Enter an Admin-only decline reason before declining."; return; }
        if (!window.confirm("The Board did not approve this application. Record the application as declined?")) return;
        try {
            const refreshedApplication = await getDoc(doc(db, "membershipApplications", applicantUid));
            if (!refreshedApplication.exists() || refreshedApplication.data().applicationStatus !== "Awaiting Board Decision") {
                if (refreshedApplication.exists()) applicationData = { applicantUid, ...refreshedApplication.data() };
                renderApplication();
                message.textContent = "This application is no longer awaiting a Board decision.";
                return;
            }
            const reviewedAt = new Date().toISOString();
            const batch = writeBatch(db);
            batch.set(doc(db, "membershipApplications", applicantUid), { applicationStatus: "Declined", reviewedAt, reviewedBy: adminUser.uid, declineReason }, { merge: true });
            batch.set(createMemberHistoryRef(applicantUid), buildMemberHistoryEntry({
                memberUid: applicantUid,
                action: "APPLICATION_DECLINED",
                category: "application",
                performedBy: adminUser.uid,
                field: "applicationStatus",
                oldValue: "Awaiting Board Decision",
                newValue: "Declined",
                source: "Admin Application Review",
                note: "See application review record."
            }));
            await batch.commit();
            applicationData = { ...applicationData, applicationStatus: "Declined", reviewedAt, reviewedBy: adminUser.uid, declineReason };
            renderApplication();
            message.textContent = "Application declined. The applicant's membership status was not changed.";
        } catch (error) {
            console.error("Application decline failed.", error);
            message.textContent = "We couldn't decline this application.";
        }
    });

    onAuthStateChanged(auth, async (authenticatedUser) => {
        if (!authenticatedUser?.emailVerified) { window.location.replace("login.html"); return; }
        try {
            if (!await isAuthorizedAdmin(authenticatedUser)) { window.location.replace("dashboard.html"); return; }
            if (!applicantUid) { accessMessage.textContent = "No application was selected."; return; }
            adminUser = authenticatedUser;
            const [applicationSnapshot, applicantSnapshot, adminMemberAccounts] = await Promise.all([
                getDoc(doc(db, "membershipApplications", applicantUid)),
                getDoc(doc(db, "users", applicantUid)),
                loadAdminMemberAccounts()
            ]);
            if (!applicationSnapshot.exists() || !["Submitted", "Awaiting Board Decision", "Approved", "Declined"].includes(applicationSnapshot.data().applicationStatus)) {
                accessMessage.textContent = "That reviewable application could not be found.";
                return;
            }
            if (!applicantSnapshot.exists()) { accessMessage.textContent = "The applicant account could not be found."; return; }
            applicationData = { applicantUid, ...applicationSnapshot.data() };
            applicantData = applicantSnapshot.data();
            memberAccountsByUid = new Map(
                adminMemberAccounts.map((memberData) => [memberData.uid, memberData])
            );
            activeSponsors = adminMemberAccounts.filter(
                (userData) => userData.membershipStatus === "Active"
            );
            renderApplication();
            adminApplicationDetail.hidden = false;
            accessMessage.textContent = "";
        } catch (error) {
            console.error("Admin application detail could not be loaded.", error);
            accessMessage.textContent = "We couldn't load this application.";
        }
    });
}


// ------------------------------------
// Admin Membership
// ------------------------------------

const adminMemberDirectory =
    document.getElementById(
        "adminMemberDirectory"
    );


if (adminMemberDirectory) {

    const adminMemberSearchInput =
        document.getElementById(
            "adminMemberSearchInput"
        );

    const adminMemberTableBody =
        document.getElementById(
            "adminMemberTableBody"
        );

    const adminMemberMessage =
        document.getElementById(
            "adminMemberMessage"
        );

    const adminMemberAccessMessage =
        document.getElementById(
            "adminMemberAccessMessage"
        );

    const adminMemberFilter =
        document.getElementById("adminMemberFilter");

    const adminSortButtons =
        Array.from(document.querySelectorAll("[data-admin-sort]"));

    let adminMembers = [];
    let adminMemberSort = { field: "member", direction: "ascending" };
    const adminMembershipDebug = {
        currentUid: null,
        emailVerified: false,
        adminActive: false,
        superAdmin: false,
        currentUserDocumentExists: false,
        collectionQueryStarted: false,
        collectionQuerySucceeded: false,
        documentsReturned: 0,
        recordsAfterFiltering: 0,
        recordsAfterSearch: 0,
        recordsAfterDuesFilter: 0,
        recordsRendered: 0
    };

    const logAdminMembershipDebug = (updates = {}) => {
        Object.assign(adminMembershipDebug, updates);
        console.log("[Admin Membership Debug]", {...adminMembershipDebug});
    };

    const naturalAdminCollator = new Intl.Collator(undefined, {
        sensitivity: "base",
        numeric: true
    });


    const formatAdminMembershipDate =
        (value) => {

            if (!value) {
                return "—";
            }


            const date =
                typeof value.toDate === "function"
                    ? value.toDate()
                    : new Date(value);


            if (Number.isNaN(date.getTime())) {
                return String(value);
            }


            return new Intl.DateTimeFormat(
                undefined,
                {
                    year: "numeric",
                    month: "short",
                    day: "numeric"
                }
            ).format(date);

        };


    const getAdminMemberName =
        (memberData) => {

            return `${memberData.preferredName || memberData.firstName || ""} ${memberData.lastName || ""}`
                .trim() ||
                "Unnamed Account";

        };


    const getAdminMemberSortValue = (memberData, field) => {
        const hasMemberName = Boolean(
            memberData.lastName || memberData.firstName || memberData.preferredName
        );
        const values = {
            member: hasMemberName
                ? `${memberData.lastName || ""}\u0000${memberData.firstName || memberData.preferredName || ""}`
                : "",
            memberId: memberData.memberId || memberData.memberNumber || "",
            email: memberData.email || "",
            status: memberData.membershipStatus || "",
            type: memberData.membershipType || "",
            memberSince: memberData.membershipStartDate || memberData.memberSince || "",
            currentThrough: memberData.membershipCurrentThrough || memberData.renewalDate || ""
        };
        return values[field] ?? "";
    };


    const getAdminDateSortValue = (value) => {
        if (!value) return null;
        const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.getTime();
    };


    const compareAdminMembers = (firstMember, secondMember) => {
        const firstValue = getAdminMemberSortValue(firstMember, adminMemberSort.field);
        const secondValue = getAdminMemberSortValue(secondMember, adminMemberSort.field);
        const firstIsBlank = firstValue === "" || firstValue === null || firstValue === undefined;
        const secondIsBlank = secondValue === "" || secondValue === null || secondValue === undefined;
        if (firstIsBlank !== secondIsBlank) return firstIsBlank ? 1 : -1;
        if (firstIsBlank) return 0;

        let comparison;
        if (["memberSince", "currentThrough"].includes(adminMemberSort.field)) {
            const firstDate = getAdminDateSortValue(firstValue);
            const secondDate = getAdminDateSortValue(secondValue);
            if (firstDate === null || secondDate === null) {
                if (firstDate !== secondDate) return firstDate === null ? 1 : -1;
                comparison = 0;
            } else {
                comparison = firstDate - secondDate;
            }
        } else {
            comparison = naturalAdminCollator.compare(String(firstValue), String(secondValue));
        }
        return adminMemberSort.direction === "ascending" ? comparison : -comparison;
    };


    const updateAdminSortIndicators = () => {
        adminSortButtons.forEach((button) => {
            const isActive = button.dataset.adminSort === adminMemberSort.field;
            const heading = button.closest("th");
            heading.setAttribute(
                "aria-sort",
                isActive ? adminMemberSort.direction : "none"
            );
            button.querySelector("span").textContent = isActive
                ? adminMemberSort.direction === "ascending" ? "▲" : "▼"
                : "";
        });
    };


    const getVisibleAdminMembers = () => {
        const searchTerm = adminMemberSearchInput.value.trim().toLocaleLowerCase();
        const recordsAfterSearch = adminMembers.filter((memberData) => [
                memberData.firstName,
                memberData.lastName,
                memberData.preferredName,
                memberData.email,
                memberData.memberId,
                memberData.memberNumber
            ].some((value) => String(value || "").toLocaleLowerCase().includes(searchTerm)));
        const recordsAfterDuesFilter = recordsAfterSearch.filter(
            (memberData) => adminMemberFilter.value !== "dues" ||
                DUES_ATTENTION_STATUSES.has(memberData.membershipStatus)
        );
        logAdminMembershipDebug({
            recordsAfterSearch: recordsAfterSearch.length,
            recordsAfterDuesFilter: recordsAfterDuesFilter.length
        });
        return recordsAfterDuesFilter.sort(compareAdminMembers);
    };


    const buildCanonicalAdminMemberList = (memberAccounts) => {
        const membersByUid = new Map();

        memberAccounts.forEach((memberData) => {
            const documentUid = memberData.uid;

            if (membersByUid.has(documentUid)) {
                return;
            }

            // The Firestore document ID is the canonical Firebase UID. A stored
            // uid field must never override it.
            membersByUid.set(documentUid, {
                ...memberData,
                uid: documentUid
            });
        });

        return Array.from(membersByUid.values());
    };


    const renderAdminMembers =
        (membersToRender) => {

            adminMemberTableBody.replaceChildren();


            membersToRender.forEach((memberData) => {

                const row =
                    document.createElement("tr");

                const cells = [
                    ["Member", getAdminMemberName(memberData)],
                    ["Member ID", memberData.memberId || memberData.memberNumber || "—"],
                    ["Email", memberData.email || "—"],
                    ["Status", memberData.membershipStatus || "No Membership"],
                    ["Type", memberData.membershipType || "—"],
                    ["Member Since", formatAdminMembershipDate(memberData.membershipStartDate || memberData.memberSince)],
                    ["Current Through", formatAdminMembershipDate(memberData.membershipCurrentThrough || memberData.renewalDate)]
                ];


                cells.forEach(([label, value]) => {

                    const cell =
                        document.createElement("td");

                    cell.dataset.label = label;
                    cell.textContent = value;
                    row.appendChild(cell);

                });

                const actionCell =
                    document.createElement("td");

                const manageLink =
                    document.createElement("a");

                actionCell.dataset.label = "Action";
                manageLink.href =
                    `admin-member.html?id=${encodeURIComponent(memberData.uid)}`;
                manageLink.textContent = "View / Manage";
                manageLink.className = "admin-manage-link";
                actionCell.appendChild(manageLink);
                row.appendChild(actionCell);


                adminMemberTableBody.appendChild(row);

            });


            adminMemberMessage.textContent =
                membersToRender.length > 0
                    ? `${membersToRender.length} account${membersToRender.length === 1 ? "" : "s"} found.`
                    : "No accounts match your search.";
            logAdminMembershipDebug({recordsRendered: membersToRender.length});

        };


    adminMemberSearchInput.addEventListener(
        "input",
        () => {
            renderAdminMembers(getVisibleAdminMembers());

        }
    );


    adminMemberFilter.addEventListener("change", () => {
        const url = new URL(window.location.href);
        if (adminMemberFilter.value === "dues") url.searchParams.set("filter", "dues");
        else url.searchParams.delete("filter");
        window.history.replaceState({}, "", url);
        renderAdminMembers(getVisibleAdminMembers());
    });


    adminSortButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const selectedField = button.dataset.adminSort;
            if (adminMemberSort.field === selectedField) {
                adminMemberSort.direction = adminMemberSort.direction === "ascending"
                    ? "descending"
                    : "ascending";
            } else {
                adminMemberSort = { field: selectedField, direction: "ascending" };
            }
            updateAdminSortIndicators();
            renderAdminMembers(getVisibleAdminMembers());
        });
    });


    onAuthStateChanged(
        auth,
        async (authenticatedUser) => {

            logAdminMembershipDebug({
                currentUid: authenticatedUser?.uid || null,
                emailVerified: authenticatedUser?.emailVerified === true
            });

            if (
                !authenticatedUser ||
                !authenticatedUser.emailVerified
            ) {

                window.location.replace(
                    "login.html"
                );

                return;

            }


            try {
                const authorization = await getAdminAuthorization(authenticatedUser);
                logAdminMembershipDebug({
                    adminActive: authorization.active,
                    superAdmin: authorization.superAdmin
                });

                if (!authorization.active) {

                    window.location.replace(
                        "dashboard.html"
                    );

                    return;

                }


                adminMemberDirectory.hidden = false;
                adminMemberAccessMessage.textContent = "";

                try {
                    const currentUserSnapshot = await getDoc(
                        doc(db, "users", authenticatedUser.uid)
                    );
                    logAdminMembershipDebug({
                        currentUserDocumentExists: currentUserSnapshot.exists()
                    });
                } catch (error) {
                    console.warn("Admin Membership current-user diagnostic read failed.", error);
                }

                logAdminMembershipDebug({collectionQueryStarted: true});
                const adminMemberAccounts = await loadAdminMemberAccounts();
                logAdminMembershipDebug({
                    collectionQuerySucceeded: true,
                    documentsReturned: adminMemberAccounts.length
                });
                adminMembers = buildCanonicalAdminMemberList(adminMemberAccounts);
                logAdminMembershipDebug({recordsAfterFiltering: adminMembers.length});
                adminMemberFilter.value =
                    new URLSearchParams(window.location.search).get("filter") === "dues"
                        ? "dues"
                        : "all";
                updateAdminSortIndicators();
                renderAdminMembers(getVisibleAdminMembers());
            } catch (error) {

                logAdminMembershipDebug({
                    collectionQuerySucceeded: false,
                    recordsRendered: 0
                });

                console.error(
                    "Admin membership data could not be loaded.",
                    error
                );

                adminMemberMessage.textContent =
                    "We couldn't load the membership accounts.";

            }

        }
    );

}


// ------------------------------------
// Admin Member Detail
// ------------------------------------

const adminMemberDetail =
    document.getElementById("adminMemberDetail");


if (adminMemberDetail) {

    const accessMessage =
        document.getElementById("adminMemberDetailAccessMessage");
    const form =
        document.getElementById("adminMembershipForm");
    const saveMessage =
        document.getElementById("adminMembershipMessage");
    const passwordResetButton =
        document.getElementById("adminSendPasswordResetButton");
    const passwordResetMessage =
        document.getElementById("adminPasswordResetMessage");
    let loadedMemberData = null;
    let loadedMemberUid = "";
    let canViewMemberHistory = false;
    const adminNameCache = new Map();
    const historyActionLabels = {
        MEMBER_ID_CHANGED: "Member ID Changed",
        MEMBERSHIP_STATUS_CHANGED: "Membership Status Changed",
        MEMBERSHIP_TYPE_CHANGED: "Membership Type Changed",
        MEMBERSHIP_START_DATE_CHANGED: "Membership Start Date Changed",
        MEMBERSHIP_CURRENT_THROUGH_CHANGED: "Membership Current Through Changed",
        APPLICATION_SPONSOR_ASSIGNED: "Application Sponsor Assigned",
        APPLICATION_SENT_TO_BOARD: "Application Sent to Board Review",
        APPLICATION_APPROVED: "Application Approved",
        APPLICATION_DECLINED: "Application Declined"
    };

    const formatHistoryValue = (entry, value) => {
        if (value === null || value === undefined || value === "") return "Not Set";
        if (["membershipStartDate", "membershipCurrentThrough"].includes(entry.field)) {
            const date = new Date(`${value}T00:00:00`);
            if (!Number.isNaN(date.getTime())) {
                return new Intl.DateTimeFormat(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric"
                }).format(date);
            }
        }
        return String(value);
    };

    const resolveAdminDisplayName = async (adminUid) => {
        if (!adminUid) return "Admin";
        if (adminNameCache.has(adminUid)) return adminNameCache.get(adminUid);

        let displayName = "Admin";
        try {
            const userSnapshot = await getDoc(doc(db, "users", adminUid));
            if (userSnapshot.exists()) {
                const userData = userSnapshot.data();
                const fullName = [userData.firstName, userData.lastName]
                    .filter((namePart) => String(namePart || "").trim())
                    .map((namePart) => String(namePart).trim())
                    .join(" ");
                if (fullName) displayName = fullName;
            }

            if (displayName === "Admin") {
                const authorizationSnapshot = await getDoc(doc(db, "adminUsers", adminUid));
                const authorization = authorizationSnapshot.exists()
                    ? authorizationSnapshot.data()
                    : {};
                if (authorization.active === true && authorization.superAdmin === true) {
                    displayName = "Super Admin";
                }
            }
        } catch (error) {
            console.warn("History Admin name could not be resolved; using a role label.", error);
        }

        adminNameCache.set(adminUid, displayName);
        return displayName;
    };

    const resolveHistoryAdminNames = async (entries) => {
        const uniqueAdminUids = Array.from(new Set(
            entries.map((entry) => entry.performedBy).filter(Boolean)
        ));
        await Promise.all(uniqueAdminUids.map(resolveAdminDisplayName));
    };

    const loadMemberHistory = async (memberUid) => {
        adminMemberDetail.querySelector(".member-history-panel")?.remove();
        const panel = document.createElement("section");
        panel.className = "admin-detail-card member-history-panel";
        const heading = document.createElement("h3");
        heading.textContent = "History Log";
        const status = document.createElement("p");
        status.className = "profile-muted";
        status.textContent = "Loading history...";
        const list = document.createElement("ol");
        list.className = "member-history-list";
        panel.append(heading, status, list);
        adminMemberDetail.appendChild(panel);

        try {
            const snapshot = await getDocs(
                collection(db, "memberHistory", memberUid, "entries")
            );
            const entries = snapshot.docs
                .map((historySnapshot) => historySnapshot.data())
                .sort((first, second) => {
                    const firstTime = first.performedAt?.toMillis?.() || 0;
                    const secondTime = second.performedAt?.toMillis?.() || 0;
                    return secondTime - firstTime;
                });
            await resolveHistoryAdminNames(entries);
            status.textContent = entries.length
                ? `${entries.length} recorded event${entries.length === 1 ? "" : "s"}.`
                : "No history has been recorded for this account yet.";

            entries.forEach((entry) => {
                const item = document.createElement("li");
                const date = document.createElement("time");
                date.textContent = entry.performedAt?.toDate
                    ? new Intl.DateTimeFormat(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit"
                    }).format(entry.performedAt.toDate())
                    : "Date unavailable";
                const title = document.createElement("strong");
                title.textContent = historyActionLabels[entry.action] || "Administrative Event";
                item.append(date, title);
                if (entry.field) {
                    const change = document.createElement("p");
                    change.textContent = `${formatHistoryValue(entry, entry.oldValue)} → ${formatHistoryValue(entry, entry.newValue)}`;
                    item.appendChild(change);
                }
                const actor = document.createElement("p");
                actor.className = "member-history-actor";
                actor.textContent = `Performed by ${adminNameCache.get(entry.performedBy) || "Admin"}`;
                item.appendChild(actor);
                if (entry.note) {
                    const note = document.createElement("p");
                    note.textContent = entry.note;
                    item.appendChild(note);
                }
                list.appendChild(item);
            });
        } catch (error) {
            console.error("Member history could not be loaded.", error);
            status.textContent = "We couldn't load this account's history.";
        }
    };

    const setText = (id, value) => {
        document.getElementById(id).textContent = value || "—";
    };

    const toDateInputValue = (value) => {
        if (!value) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
        const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
    };

    const populateSelect = (select, options, blankLabel) => {
        select.replaceChildren();
        if (blankLabel) {
            const blankOption = document.createElement("option");
            blankOption.value = "";
            blankOption.textContent = blankLabel;
            select.appendChild(blankOption);
        }
        options.forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
    };

    populateSelect(
        document.getElementById("adminMembershipStatus"),
        MEMBERSHIP_STATUSES,
        "No Membership Status"
    );
    populateSelect(
        document.getElementById("adminMembershipType"),
        MEMBERSHIP_TYPES,
        "Not Assigned"
    );

    passwordResetButton.addEventListener("click", async () => {
        const memberEmail = loadedMemberData?.email?.trim();
        if (!memberEmail) {
            passwordResetMessage.textContent =
                "This account does not have an email address available for password reset.";
            return;
        }
        if (!window.confirm(`Send a password reset email to ${memberEmail}?`)) return;

        passwordResetButton.disabled = true;
        passwordResetMessage.textContent = "Sending password reset email...";
        try {
            await sendPasswordResetEmail(auth, memberEmail);
            passwordResetMessage.textContent = "Password reset email sent.";
        } catch (error) {
            console.error("Admin password reset email could not be sent.", error);
            passwordResetMessage.textContent =
                "We couldn't send the password reset email. Please try again.";
        } finally {
            passwordResetButton.disabled = false;
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        saveMessage.textContent = "Saving membership changes...";
        const authenticatedAdmin = auth.currentUser;

        const values = {
            memberId: document.getElementById("adminMemberId").value.trim(),
            membershipStatus: document.getElementById("adminMembershipStatus").value,
            membershipType: document.getElementById("adminMembershipType").value,
            membershipStartDate: document.getElementById("adminMembershipStartDate").value,
            membershipCurrentThrough: document.getElementById("adminMembershipCurrentThrough").value
        };
        const historyActions = {
            memberId: "MEMBER_ID_CHANGED",
            membershipStatus: "MEMBERSHIP_STATUS_CHANGED",
            membershipType: "MEMBERSHIP_TYPE_CHANGED",
            membershipStartDate: "MEMBERSHIP_START_DATE_CHANGED",
            membershipCurrentThrough: "MEMBERSHIP_CURRENT_THROUGH_CHANGED"
        };

        try {
            if (!authenticatedAdmin || !await isAuthorizedAdmin(authenticatedAdmin)) {
                window.location.replace("dashboard.html");
                return;
            }

            const currentMemberSnapshot = await getDoc(doc(db, "users", loadedMemberUid));
            if (!currentMemberSnapshot.exists()) {
                saveMessage.textContent = "This membership account no longer exists.";
                return;
            }
            loadedMemberData = currentMemberSnapshot.data();

            const userRef = doc(db, "users", loadedMemberUid);
            const memberProfileRef = doc(db, "memberProfiles", loadedMemberUid);
            const updatedAt = new Date().toISOString();
            const membershipUpdate = {
                membershipUpdatedAt: updatedAt,
                membershipUpdatedBy: authenticatedAdmin.uid
            };

            Object.entries(values).forEach(([fieldName, value]) => {
                membershipUpdate[fieldName] = value || deleteField();
            });

            const memberProfileSource = {
                ...loadedMemberData,
                ...values,
                // Canonical fields intentionally supersede legacy aliases,
                // including when an Admin clears a value.
                memberNumber: "",
                memberSince: "",
                renewalDate: "",
                updatedAt: loadedMemberData.updatedAt || updatedAt
            };
            const memberProfileData =
                buildMemberProfileData(loadedMemberUid, memberProfileSource);
            const batch = writeBatch(db);
            const historyChanges = Object.entries(values)
                .map(([field, value]) => ({
                    field,
                    oldValue: loadedMemberData[field] || null,
                    newValue: value || null
                }))
                .filter(({oldValue, newValue}) => oldValue !== newValue);

            batch.set(userRef, membershipUpdate, { merge: true });
            batch.set(memberProfileRef, memberProfileData);
            historyChanges.forEach(({field, oldValue, newValue}) => {
                batch.set(createMemberHistoryRef(loadedMemberUid), buildMemberHistoryEntry({
                    memberUid: loadedMemberUid,
                    action: historyActions[field],
                    category: "membership",
                    performedBy: authenticatedAdmin.uid,
                    field,
                    oldValue,
                    newValue,
                    source: "Admin Membership"
                }));
            });
            await batch.commit();

            loadedMemberData = memberProfileSource;
            saveMessage.textContent = "Membership changes saved successfully.";
            if (canViewMemberHistory) {
                await loadMemberHistory(loadedMemberUid);
            }
        } catch (error) {
            console.error("Admin membership changes could not be saved.", error);
            saveMessage.textContent = "We couldn't save the membership changes. Please try again.";
        }
    });

    onAuthStateChanged(auth, async (authenticatedUser) => {
        if (!authenticatedUser || !authenticatedUser.emailVerified) {
            window.location.replace("login.html");
            return;
        }

        try {
            const authorization = await getAdminAuthorization(authenticatedUser);
            canViewMemberHistory = authorization.superAdmin;
            if (!authorization.active) {
                window.location.replace("dashboard.html");
                return;
            }

            loadedMemberUid =
                new URLSearchParams(window.location.search).get("id") || "";
            if (!loadedMemberUid) {
                accessMessage.textContent = "No membership account was selected.";
                return;
            }

            const userSnapshot = await getDoc(doc(db, "users", loadedMemberUid));
            if (!userSnapshot.exists()) {
                accessMessage.textContent = "That membership account could not be found.";
                return;
            }

            loadedMemberData = userSnapshot.data();
            const fullName = `${loadedMemberData.firstName || ""} ${loadedMemberData.lastName || ""}`.trim();
            setText("adminMemberName", fullName || "Unnamed Account");
            setText("adminMemberPreferredName", loadedMemberData.preferredName);
            setText("adminMemberEmail", loadedMemberData.email);
            setText("adminMemberUid", loadedMemberUid);
            setText("adminMemberCreatedAt", toDateInputValue(loadedMemberData.createdAt));
            setText("adminMemberPhone", loadedMemberData.phone);
            setText("adminMemberLocation", [
                loadedMemberData.city,
                loadedMemberData.subdivisionName || loadedMemberData.state,
                loadedMemberData.countryName || loadedMemberData.country
            ].filter(Boolean).join(", "));
            setText("adminMemberProfileCompletion", loadedMemberData.profileCompleted ? "Complete" : "Incomplete");

            document.getElementById("adminMemberId").value = loadedMemberData.memberId || "";
            document.getElementById("adminMembershipStatus").value =
                MEMBERSHIP_STATUSES.includes(loadedMemberData.membershipStatus) ? loadedMemberData.membershipStatus : "";
            document.getElementById("adminMembershipType").value =
                MEMBERSHIP_TYPES.includes(loadedMemberData.membershipType) ? loadedMemberData.membershipType : "";
            document.getElementById("adminMembershipStartDate").value = toDateInputValue(loadedMemberData.membershipStartDate);
            document.getElementById("adminMembershipCurrentThrough").value = toDateInputValue(loadedMemberData.membershipCurrentThrough);

            adminMemberDetail.hidden = false;
            accessMessage.textContent = "";
            if (canViewMemberHistory) {
                await loadMemberHistory(loadedMemberUid);
            }
        } catch (error) {
            console.error("Admin member details could not be loaded.", error);
            accessMessage.textContent = "We couldn't load this membership account.";
        }
    });
}


// ------------------------------------
// Member Lookup
// ------------------------------------

const memberDirectory =
    document.getElementById(
        "memberDirectory"
    );


if (memberDirectory) {

    const memberSearchInput =
        document.getElementById(
            "memberSearchInput"
        );

    const memberResults =
        document.getElementById(
            "memberResults"
        );

    const memberDirectoryMessage =
        document.getElementById(
            "memberDirectoryMessage"
        );

    let directoryMembers = [];


    const getMemberInitials =
        (memberData) => {

            return `${(memberData.firstName || "").charAt(0)}${(memberData.lastName || "").charAt(0)}`
                .toUpperCase() ||
                "WBA";

        };


    const getMemberDisplayName =
        (memberData) => {

            return memberData.displayName ||
                `${memberData.preferredName || memberData.firstName || ""} ${memberData.lastName || ""}`
                    .trim() ||
                "WBA Member";

        };


    const loadMemberPhoto =
        async (
            memberData,
            photoImage,
            photoPlaceholder
        ) => {

            if (!memberData.profilePhotoPath) {
                return;
            }


            try {

                const photoRef =
                    ref(
                        storage,
                        memberData.profilePhotoPath
                    );

                const photoURL =
                    new URL(
                        await getDownloadURL(photoRef)
                    );


                if (memberData.profilePhotoUpdatedAt) {

                    photoURL.searchParams.set(
                        "updatedAt",
                        memberData.profilePhotoUpdatedAt
                    );

                }


                photoImage.onerror = () => {

                    photoImage.style.display =
                        "none";

                    photoPlaceholder.style.display =
                        "flex";

                };

                photoImage.src =
                    photoURL.toString();

                photoImage.style.display =
                    "block";

                photoPlaceholder.style.display =
                    "none";

            } catch (error) {

                console.error(
                    "Member directory photo could not be loaded.",
                    error
                );

            }

        };


    const renderMemberCard =
        (memberData) => {

            const memberCard =
                document.createElement("a");

            memberCard.className =
                "member-card";

            memberCard.href =
                `profile.html?id=${encodeURIComponent(memberData.uid)}`;


            const photoContainer =
                document.createElement("div");

            photoContainer.className =
                "member-card-photo";

            const photoImage =
                document.createElement("img");

            photoImage.className =
                "member-card-photo-image";

            photoImage.alt =
                `${getMemberDisplayName(memberData)} profile photo`;

            photoImage.style.display =
                "none";

            const photoPlaceholder =
                document.createElement("div");

            photoPlaceholder.className =
                "member-card-photo-placeholder";

            photoPlaceholder.textContent =
                getMemberInitials(memberData);

            photoContainer.append(
                photoImage,
                photoPlaceholder
            );


            const memberDetails =
                document.createElement("div");

            memberDetails.className =
                "member-card-details";

            const memberName =
                document.createElement("h2");

            memberName.textContent =
                getMemberDisplayName(memberData);

            memberDetails.appendChild(
                memberName
            );


            if (memberData.location) {

                const memberLocation =
                    document.createElement("p");

                memberLocation.className =
                    "member-card-location";

                memberLocation.textContent =
                    memberData.location;

                memberDetails.appendChild(
                    memberLocation
                );

            }


            const membershipLabel =
                memberData.membershipType ||
                getMemberFacingStatus(
                    memberData.membershipStatus
                );


            if (membershipLabel) {

                const memberMembership =
                    document.createElement("p");

                memberMembership.className =
                    "member-card-membership";

                memberMembership.textContent =
                    membershipLabel;

                memberDetails.appendChild(
                    memberMembership
                );

            }


            if (
                Array.isArray(memberData.wbaRoles) &&
                memberData.wbaRoles.length > 0
            ) {

                const roleList =
                    document.createElement("div");

                roleList.className =
                    "profile-badges";


                memberData.wbaRoles.forEach((role) => {

                    const roleName =
                        typeof role === "string"
                            ? role
                            : role?.name;


                    if (!roleName) {
                        return;
                    }


                    const roleBadge =
                        document.createElement("span");

                    roleBadge.className =
                        "profile-role-badge";

                    roleBadge.textContent =
                        roleName;

                    roleList.appendChild(
                        roleBadge
                    );

                });


                if (roleList.children.length > 0) {

                    memberDetails.appendChild(
                        roleList
                    );

                }

            }


            const viewProfileLabel =
                document.createElement("span");

            viewProfileLabel.className =
                "member-card-action";

            viewProfileLabel.textContent =
                "View Profile";

            memberDetails.appendChild(
                viewProfileLabel
            );

            memberCard.append(
                photoContainer,
                memberDetails
            );

            loadMemberPhoto(
                memberData,
                photoImage,
                photoPlaceholder
            );


            return memberCard;

        };


    const renderMemberDirectory =
        (members, hasSearchQuery = false) => {

            memberResults.replaceChildren();


            if (members.length === 0) {

                memberDirectoryMessage.textContent =
                    hasSearchQuery
                        ? "No members match your search."
                        : "No members are available yet.";

                return;

            }


            memberDirectoryMessage.textContent =
                "";


            members.forEach((memberData) => {

                memberResults.appendChild(
                    renderMemberCard(memberData)
                );

            });

        };


    const filterMembers =
        (searchQuery) => {

            const normalizedQuery =
                searchQuery
                    .trim()
                    .toLocaleLowerCase();


            if (!normalizedQuery) {
                return directoryMembers;
            }


            return directoryMembers.filter(
                (memberData) => {

                    const searchableNames = [
                        memberData.displayName,
                        memberData.firstName,
                        memberData.lastName,
                        memberData.preferredName
                    ]
                        .filter(Boolean)
                        .join(" ")
                        .toLocaleLowerCase();


                    return searchableNames.includes(
                        normalizedQuery
                    );

                }
            );

        };


    const loadMemberDirectory =
        async () => {

            memberDirectoryMessage.textContent =
                "Loading members...";


            try {

                const memberProfilesSnapshot =
                    await getDocs(
                        collection(
                            db,
                            "memberProfiles"
                        )
                    );

                directoryMembers =
                    memberProfilesSnapshot.docs
                        .map((memberDocument) => ({
                            ...memberDocument.data(),
                            uid: memberDocument.id
                        }))
                        .sort((firstMember, secondMember) =>
                            getMemberDisplayName(firstMember)
                                .localeCompare(
                                    getMemberDisplayName(secondMember),
                                    undefined,
                                    {
                                        sensitivity: "base"
                                    }
                                )
                        );


                renderMemberDirectory(
                    directoryMembers
                );

            } catch (error) {

                console.error(error);

                memberResults.replaceChildren();

                memberDirectoryMessage.textContent =
                    "We couldn't load the member directory. Please try again.";

            }

        };


    memberSearchInput.addEventListener(
        "input",
        () => {

            const searchQuery =
                memberSearchInput.value;


            renderMemberDirectory(
                filterMembers(searchQuery),
                Boolean(searchQuery.trim())
            );

        }
    );


    onAuthStateChanged(
        auth,
        async (authenticatedUser) => {

            if (
                !authenticatedUser ||
                !authenticatedUser.emailVerified
            ) {

                window.location.href =
                    "login.html";

                return;

            }


            await loadMemberDirectory();

        }
    );

}


// ------------------------------------
// Member Profile
// ------------------------------------

// ------------------------------------
// Member Profile Display
// ------------------------------------

const memberProfile =
    document.getElementById("memberProfile");


if (memberProfile) {

    const profileMessage =
        document.getElementById("profileMessage");

    const editProfileButton =
        document.getElementById(
            "editProfileButton"
        );

    const viewAsOthersButton =
        document.getElementById(
            "viewAsOthersButton"
        );

    const profilePreviewBanner =
        document.getElementById(
            "profilePreviewBanner"
        );


    onAuthStateChanged(
        auth,
        async (authenticatedUser) => {

            if (!authenticatedUser) {

                window.location.href =
                    "login.html";

                return;

            }


            if (!authenticatedUser.emailVerified) {

                window.location.href =
                    "login.html";

                return;

            }


            const profileParameters =
                new URLSearchParams(
                    window.location.search
                );

            const requestedProfileOwnerId =
                profileParameters.get("id")?.trim();

            const profileOwnerId =
                requestedProfileOwnerId ||
                authenticatedUser.uid;

            const isOwner =
                profileOwnerId ===
                authenticatedUser.uid;

            const isMemberPreview =
                isOwner &&
                profileParameters.get("preview") ===
                    "member";

            const usesOwnerView =
                isOwner && !isMemberPreview;


            editProfileButton.style.display =
                usesOwnerView
                    ? "inline-block"
                    : "none";

            viewAsOthersButton.style.display =
                usesOwnerView
                    ? "inline-block"
                    : "none";

            profilePreviewBanner.style.display =
                isMemberPreview
                    ? "flex"
                    : "none";


            try {

                const profileOwnerRef =
                    doc(
                        db,
                        usesOwnerView
                            ? "users"
                            : "memberProfiles",
                        profileOwnerId
                    );

                const profileOwnerSnapshot =
                    await getDoc(profileOwnerRef);


                if (!profileOwnerSnapshot.exists()) {

                    profileMessage.textContent =
                        isMemberPreview
                            ? "Your member-facing profile has not been generated yet. Save Edit Profile once and try again."
                            : "We couldn't find this member profile.";

                    return;

                }


                const profileOwnerData =
                    profileOwnerSnapshot.data();

                // -------------------------
                // Name
                // -------------------------

                const firstName =
                    profileOwnerData.firstName || "";

                const lastName =
                    profileOwnerData.lastName || "";

                const preferredName =
                    profileOwnerData.preferredName || "";


                const displayFirstName =
                    preferredName || firstName;


                const displayName =
                    `${displayFirstName} ${lastName}`.trim();


                document.getElementById(
                    "profileDisplayName"
                ).textContent =
                    displayName || "WBA Member";


                // -------------------------
                // Profile Initials
                // -------------------------

                const initials =
                    `${firstName.charAt(0)}${lastName.charAt(0)}`
                        .toUpperCase();


                document.getElementById(
                    "profileInitials"
                ).textContent =
                    initials || "WBA";


                // -------------------------
                // Profile Photo
                // -------------------------

                if (profileOwnerData.profilePhotoPath) {

                    const profilePhoto =
                        document.getElementById(
                            "profilePhoto"
                        );

                    const profilePhotoPlaceholder =
                        document.getElementById(
                            "profilePhotoPlaceholder"
                        );


                    try {

                        const photoRef =
                            ref(
                                storage,
                                profileOwnerData.profilePhotoPath
                            );

                        const photoURL =
                            new URL(
                                await getDownloadURL(photoRef)
                            );


                        if (profileOwnerData.profilePhotoUpdatedAt) {

                            photoURL.searchParams.set(
                                "updatedAt",
                                profileOwnerData.profilePhotoUpdatedAt
                            );

                        }


                        profilePhoto.onerror = () => {

                            profilePhoto.style.display =
                                "none";

                            profilePhotoPlaceholder.style.display =
                                "flex";

                        };


                        profilePhoto.src =
                            photoURL.toString();

                        profilePhoto.style.display =
                            "block";

                        profilePhotoPlaceholder.style.display =
                            "none";

                    } catch (error) {

                        console.error(
                            "Profile photo could not be loaded.",
                            error
                        );

                        profilePhoto.style.display =
                            "none";

                        profilePhotoPlaceholder.style.display =
                            "flex";

                    }

                }


             // -------------------------
// Location
// -------------------------

const profileLocation =
    usesOwnerView
        ? buildDisplayLocation(
            profileOwnerData,
            "full"
        )
        : profileOwnerData.location ||
            (
                profileOwnerData.locationVisibility ===
                    "private"
                    ? "Private"
                    : "Not provided"
            );


const profileHeaderLocation =
    document.getElementById(
        "profileLocation"
    );


if (
    profileLocation &&
    profileLocation !== "Private" &&
    profileLocation !== "Not provided"
) {

    profileHeaderLocation.textContent =
        profileLocation;

    profileHeaderLocation.style.display =
        "block";

} else {

    profileHeaderLocation.textContent = "";
    profileHeaderLocation.style.display =
        "none";

}


document.getElementById(
    "profileFullLocation"
).textContent =
    profileLocation || "Not provided";


// -------------------------
// Contact
// -------------------------

const profileOwnerEmail =
    profileOwnerData.email ||
    (usesOwnerView
        ? authenticatedUser.email
        : "");


if (
    usesOwnerView ||
    profileOwnerData.email
) {

    document.getElementById(
        "profileEmail"
    ).textContent =
        profileOwnerEmail || "Not provided";

} else {

    document.getElementById(
        "profileEmail"
    ).textContent =
        "Private";

}


if (
    usesOwnerView ||
    profileOwnerData.phone
) {

    document.getElementById(
        "profilePhone"
    ).textContent =
        profileOwnerData.phone || "Not provided";

} else {

    document.getElementById(
        "profilePhone"
    ).textContent =
        "Private";

}
// -------------------------
// About
// -------------------------

if (
    usesOwnerView &&
    profileOwnerData.about
) {

    document.getElementById(
        "profileAbout"
    ).textContent =
        profileOwnerData.about;

    document.getElementById(
        "profileAbout"
    ).classList.remove(
        "profile-muted"
    );

} else if (profileOwnerData.about) {

    document.getElementById(
        "profileAbout"
    ).textContent =
        profileOwnerData.about;

    document.getElementById(
        "profileAbout"
    ).classList.remove(
        "profile-muted"
    );

} else if (
    !usesOwnerView &&
    profileOwnerData.aboutVisibility ===
        "private"
) {

    document.getElementById(
        "profileAbout"
    ).textContent =
        "Private";

}


                // -------------------------
                // WBA Roles
                // -------------------------

                const wbaRoles =
                    Array.isArray(profileOwnerData.wbaRoles)
                        ? profileOwnerData.wbaRoles
                        : [];

                const roleNames =
                    wbaRoles
                        .map((role) =>
                            typeof role === "string"
                                ? role
                                : role?.name
                        )
                        .filter(Boolean);

                const profileHeaderRoles =
                    document.getElementById(
                        "profileHeaderRoles"
                    );


                if (roleNames.length > 0) {

                    profileHeaderRoles.textContent =
                        roleNames.join(", ");

                    profileHeaderRoles.style.display =
                        "block";

                } else {

                    profileHeaderRoles.textContent = "";
                    profileHeaderRoles.style.display =
                        "none";

                }

                const wbaRolesContainer =
                    document.getElementById(
                        "wbaRoles"
                    );


                const wbaRolesSection =
                    document.getElementById(
                        "wbaRolesSection"
                    );


                wbaRolesSection.style.display =
                    usesOwnerView
                        ? "block"
                        : "none";


                if (
                    usesOwnerView &&
                    roleNames.length > 0
                ) {

                    wbaRolesContainer.replaceChildren();


                    roleNames.forEach((roleName) => {


                        const roleBadge =
                            document.createElement(
                                "span"
                            );

                        roleBadge.className =
                            "profile-role-badge";

                        roleBadge.textContent =
                            roleName;

                        wbaRolesContainer.appendChild(
                            roleBadge
                        );

                    });


                    if (!wbaRolesContainer.children.length) {

                        const noRolesMessage =
                            document.createElement(
                                "p"
                            );

                        noRolesMessage.className =
                            "profile-muted";

                        noRolesMessage.textContent =
                            "No current WBA roles.";

                        wbaRolesContainer.appendChild(
                            noRolesMessage
                        );

                    }

                }


                // -------------------------
                // Membership Information
                // -------------------------

                const formatMembershipDate =
                    (value) => {

                        if (!value) {
                            return "—";
                        }


                        let date;


                        if (
                            typeof value === "string" &&
                            /^\d{4}-\d{2}-\d{2}$/.test(value)
                        ) {

                            const [year, month, day] =
                                value
                                    .split("-")
                                    .map(Number);

                            date =
                                new Date(
                                    year,
                                    month - 1,
                                    day
                                );

                        } else {

                            date =
                                typeof value.toDate === "function"
                                    ? value.toDate()
                                    : new Date(value);

                        }


                        if (Number.isNaN(date.getTime())) {
                            return String(value);
                        }


                        return new Intl.DateTimeFormat(
                            undefined,
                            {
                                year: "numeric",
                                month: "long",
                                day: "numeric"
                            }
                        ).format(date);

                    };

                document.getElementById(
                    "membershipStatus"
                ).textContent =
                    usesOwnerView
                        ? profileOwnerData.membershipStatus ||
                            "No Membership"
                        : getMemberFacingStatus(
                            profileOwnerData.membershipStatus
                        );


                document.getElementById(
                    "membershipSectionHeading"
                ).textContent =
                    usesOwnerView
                        ? "WBA Membership"
                        : "Membership Status";


                [
                    "membershipTypeDetail",
                    "memberIdDetail",
                    "memberSinceDetail",
                    "membershipCurrentThroughDetail"
                ].forEach((detailId) => {

                    document.getElementById(
                        detailId
                    ).style.display =
                        usesOwnerView
                            ? "flex"
                            : "none";

                });


                document.getElementById(
                    "membershipType"
                ).textContent =
                    profileOwnerData.membershipType ||
                    "—";


                document.getElementById(
                    "memberId"
                ).textContent =
                    profileOwnerData.memberId ||
                    profileOwnerData.memberNumber ||
                    "—";


                document.getElementById(
                    "memberSince"
                ).textContent =
                    formatMembershipDate(
                        profileOwnerData.membershipStartDate ||
                        profileOwnerData.memberSince
                    );


                document.getElementById(
                    "membershipCurrentThrough"
                ).textContent =
                    formatMembershipDate(
                        profileOwnerData.membershipCurrentThrough ||
                        profileOwnerData.renewalDate
                    );


                // -------------------------
                // Dog Sports & Activities
                // -------------------------

                const dogSportsSection =
                    document.getElementById(
                        "dogSportsSection"
                    );

                const profileDogSports =
                    document.getElementById(
                        "profileDogSports"
                    );

                const dogSportLabels =
                    Array.isArray(profileOwnerData.dogSports)
                        ? profileOwnerData.dogSports
                            .map((sportId) =>
                                DOG_SPORT_LABELS.get(sportId)
                            )
                            .filter(Boolean)
                        : [];


                profileDogSports.replaceChildren();


                if (dogSportLabels.length > 0) {

                    dogSportLabels.forEach((sportLabel) => {

                        const sportTag =
                            document.createElement("span");

                        sportTag.className =
                            "profile-sport-tag";

                        sportTag.textContent =
                            sportLabel;

                        profileDogSports.appendChild(
                            sportTag
                        );

                    });

                    dogSportsSection.style.display =
                        "block";

                } else if (usesOwnerView) {

                    const emptySportsMessage =
                        document.createElement("p");

                    emptySportsMessage.className =
                        "profile-muted";

                    emptySportsMessage.textContent =
                        "No Dog Sports & Activities added yet.";

                    profileDogSports.appendChild(
                        emptySportsMessage
                    );

                    dogSportsSection.style.display =
                        "block";

                } else {

                    dogSportsSection.style.display =
                        "none";

                }


                console.log(
                    "Member profile display loaded."
                );


            } catch (error) {

                console.error(error);


                profileMessage.textContent =
                    isOwner
                        ? isMemberPreview
                            ? "We couldn't load your member-facing profile preview."
                            : "We couldn't load your profile information."
                        : "We couldn't load this member profile.";

            }

        }
    );

}

// ------------------------------------
// Edit Profile
// ------------------------------------

const editProfileForm =
    document.getElementById("editProfileForm");


if (editProfileForm) {

    const editProfileMessage =
        document.getElementById(
            "editProfileMessage"
        );

        const profilePhotoInput =
    document.getElementById(
        "profilePhotoInput"
    );

const removeProfilePhotoButton =
    document.getElementById(
        "removeProfilePhotoButton"
    );

const profilePhotoMessage =
    document.getElementById(
        "profilePhotoMessage"
    );

const editProfilePhoto =
    document.getElementById(
        "editProfilePhoto"
    );

const editProfilePhotoPlaceholder =
    document.getElementById(
        "editProfilePhotoPlaceholder"
    );

const dogSportsCheckboxGrid =
    document.getElementById(
        "dogSportsCheckboxGrid"
    );

const requestSportButton =
    document.getElementById(
        "requestSportButton"
    );

const requestSportMessage =
    document.getElementById(
        "requestSportMessage"
    );

const editCountrySelect =
    document.getElementById("country");

const editSubdivisionSelect =
    document.getElementById("state");

let unmappedEditCountry = "";
let unmappedEditSubdivision = "";

populateCountrySelect(editCountrySelect);
populateSubdivisionSelect(editSubdivisionSelect, "");

editCountrySelect.addEventListener("change", () => {
    unmappedEditCountry = "";
    unmappedEditSubdivision = "";
    populateSubdivisionSelect(
        editSubdivisionSelect,
        editCountrySelect.value
    );
});


DOG_SPORT_OPTIONS.forEach((option) => {

    const checkboxLabel =
        document.createElement("label");

    checkboxLabel.className =
        "checkbox-option";

    const checkbox =
        document.createElement("input");

    checkbox.type =
        "checkbox";

    checkbox.name =
        "dogSports";

    checkbox.value =
        option.id;

    checkboxLabel.append(
        checkbox,
        document.createTextNode(option.label)
    );

    dogSportsCheckboxGrid.appendChild(
        checkboxLabel
    );

});


requestSportButton.addEventListener(
    "click",
    () => {

        requestSportMessage.textContent =
            "Request feature coming soon.";

    }
);

    onAuthStateChanged(
        auth,
        async (user) => {

            if (!user) {

                window.location.href =
                    "login.html";

                return;
            }


            if (!user.emailVerified) {

                window.location.href =
                    "login.html";

                return;
            }


            const userRef =
    doc(db, "users", user.uid);


let userData;

let profilePhotoMarkedForRemoval =
    false;


try {

                const userSnapshot =
                    await getDoc(userRef);


                if (!userSnapshot.exists()) {

                    editProfileMessage.textContent =
                        "We couldn't find your profile.";

                    return;
                }


                userData =
                    userSnapshot.data();

                    // -------------------------
                    // Profile Photo Initials
                    // -------------------------

const editInitials =
    `${(userData.firstName || "").charAt(0)}${(userData.lastName || "").charAt(0)}`
        .toUpperCase();

document.getElementById(
    "editProfileInitials"
).textContent =
    editInitials || "WBA";


if (userData.profilePhotoPath) {

    try {

        const photoRef =
            ref(
                storage,
                userData.profilePhotoPath
            );

        const photoURL =
            new URL(
                await getDownloadURL(photoRef)
            );


        if (userData.profilePhotoUpdatedAt) {

            photoURL.searchParams.set(
                "updatedAt",
                userData.profilePhotoUpdatedAt
            );

        }


        editProfilePhoto.onerror = () => {

            editProfilePhoto.style.display =
                "none";

            editProfilePhotoPlaceholder.style.display =
                "flex";

            removeProfilePhotoButton.style.display =
                "none";

        };


        editProfilePhoto.src =
            photoURL.toString();

        editProfilePhoto.style.display =
            "block";

        editProfilePhotoPlaceholder.style.display =
            "none";

        removeProfilePhotoButton.style.display =
            "inline-block";

    } catch (error) {

        console.error(
            "Profile photo could not be loaded for editing.",
            error
        );

        editProfilePhoto.style.display =
            "none";

        editProfilePhotoPlaceholder.style.display =
            "flex";

        removeProfilePhotoButton.style.display =
            "none";

    }

}

                // -------------------------
                // Load existing information
                // -------------------------

                document.getElementById(
                    "firstName"
                ).value =
                    userData.firstName || "";


                document.getElementById(
                    "lastName"
                ).value =
                    userData.lastName || "";


                document.getElementById(
                    "preferredName"
                ).value =
                    userData.preferredName || "";


                document.getElementById(
                    "email"
                ).value =
                    user.email || "";


                document.getElementById(
                    "phone"
                ).value =
                    userData.phone || "";


                document.getElementById(
                    "address"
                ).value =
                    userData.address || "";


                document.getElementById(
                    "city"
                ).value =
                    userData.city || "";


                document.getElementById(
                    "zip"
                ).value =
                    userData.zip || "";


                const resolvedCountry = resolveCountry(
                    userData.countryCode,
                    userData.countryName || userData.country
                );
                unmappedEditCountry = resolvedCountry
                    ? ""
                    : userData.countryName || userData.country || "";

                populateCountrySelect(
                    editCountrySelect,
                    resolvedCountry?.code || ""
                );

                const resolvedSubdivision = resolveSubdivision(
                    resolvedCountry,
                    userData.subdivisionCode,
                    userData.subdivisionName || userData.state
                );
                unmappedEditSubdivision = resolvedSubdivision
                    ? ""
                    : userData.subdivisionName || userData.state || "";

                populateSubdivisionSelect(
                    editSubdivisionSelect,
                    resolvedCountry?.code || "",
                    resolvedSubdivision?.code || ""
                );


                document.getElementById(
                    "about"
                ).value =
                    userData.about || "";

                    document.getElementById(
    "emailVisibility"
).value =
    userData.privacy?.email || "private";


document.getElementById(
    "phoneVisibility"
).value =
    userData.privacy?.phone || "private";


document.getElementById(
    "locationVisibility"
).value =
    userData.privacy?.location || "state";


document.getElementById(
    "aboutVisibility"
).value =
    userData.privacy?.about || "members";


document.getElementById(
    "preferredNameVisibility"
).value =
    userData.privacy?.preferredName || "members";


const savedDogSports =
    new Set(
        Array.isArray(userData.dogSports)
            ? userData.dogSports
            : []
    );


dogSportsCheckboxGrid
    .querySelectorAll(
        'input[name="dogSports"]'
    )
    .forEach((checkbox) => {

        checkbox.checked =
            savedDogSports.has(checkbox.value);

    });




                console.log(
                    "Edit Profile information loaded."
                );


            } catch (error) {

                console.error(error);


                editProfileMessage.textContent =
                    "We couldn't load your profile information.";

                return;
            }

// -------------------------
// Profile Photo Preview
// -------------------------

profilePhotoInput.addEventListener(
    "change",
    () => {

        const file =
            profilePhotoInput.files[0];

        profilePhotoMessage.textContent =
            "";

        if (!file) {
            return;
        }


        // Make sure it is an image

        if (!file.type.startsWith("image/")) {

            profilePhotoMessage.textContent =
                "Please choose an image file.";

            profilePhotoInput.value =
                "";

            return;
        }


        // Maximum size: 5 MB

        if (file.size > 5 * 1024 * 1024) {

            profilePhotoMessage.textContent =
                "Profile photos must be smaller than 5 MB.";

            profilePhotoInput.value =
                "";

            return;
        }


        profilePhotoMarkedForRemoval =
            false;


        // Create local preview

        const previewURL =
            URL.createObjectURL(file);


        editProfilePhoto.src =
            previewURL;

        editProfilePhoto.style.display =
            "block";

        editProfilePhotoPlaceholder.style.display =
            "none";

        removeProfilePhotoButton.style.display =
            "inline-block";


        profilePhotoMessage.textContent =
            "Photo selected. It will be saved when you save your changes.";

    }
);


// -------------------------
// Mark Profile Photo for Removal
// -------------------------

removeProfilePhotoButton.addEventListener(
    "click",
    () => {

        profilePhotoMarkedForRemoval =
            true;

        profilePhotoInput.value =
            "";

        editProfilePhoto.removeAttribute(
            "src"
        );

        editProfilePhoto.style.display =
            "none";

        editProfilePhotoPlaceholder.style.display =
            "flex";

        removeProfilePhotoButton.style.display =
            "none";

        profilePhotoMessage.textContent =
            "Photo will be removed when you save your changes.";

    }
);

            // -------------------------
            // Save changes
            // -------------------------

            editProfileForm.addEventListener(
                "submit",
                async (event) => {

                    event.preventDefault();


                    editProfileMessage.textContent =
                        "Saving...";


                    try {

    let profilePhotoPath =
        userData.profilePhotoPath || null;


    // --------------------------------
    // Upload selected profile photo
    // --------------------------------

    const selectedPhoto =
        profilePhotoInput.files[0];


    if (
        profilePhotoMarkedForRemoval &&
        !selectedPhoto &&
        profilePhotoPath
    ) {

        const existingPhotoRef =
            ref(
                storage,
                profilePhotoPath
            );


        try {

            await deleteObject(
                existingPhotoRef
            );

        } catch (error) {

            if (
                error.code !==
                "storage/object-not-found"
            ) {

                throw error;

            }

        }


        profilePhotoPath =
            null;

    }


    if (selectedPhoto) {

        if (!selectedPhoto.type.startsWith("image/")) {

            editProfileMessage.textContent =
                "Please choose a valid image file.";

            return;
        }


        if (selectedPhoto.size > 5 * 1024 * 1024) {

            editProfileMessage.textContent =
                "Profile photos must be smaller than 5 MB.";

            return;
        }


        profilePhotoPath =
            `profilePhotos/${user.uid}/profilePhoto`;


        const photoRef =
            ref(
                storage,
                profilePhotoPath
            );


        await uploadBytes(
            photoRef,
            selectedPhoto,
            {
                contentType:
                    selectedPhoto.type
            }
        );

    }


    // --------------------------------
    // Save profile information
    // --------------------------------

    const selectedCountry =
        getCountry(editCountrySelect.value);

    const selectedSubdivision =
        selectedCountry?.subdivisions.find(
            (subdivision) =>
                subdivision.code === editSubdivisionSelect.value
        ) || null;

    const profileData = {

        firstName:
            document
                .getElementById(
                    "firstName"
                )
                .value
                .trim(),


        lastName:
            document
                .getElementById(
                    "lastName"
                )
                .value
                .trim(),


        preferredName:
            document
                .getElementById(
                    "preferredName"
                )
                .value
                .trim(),


        phone:
            document
                .getElementById(
                    "phone"
                )
                .value
                .trim(),


        address:
            document
                .getElementById(
                    "address"
                )
                .value
                .trim(),


        city:
            document
                .getElementById(
                    "city"
                )
                .value
                .trim(),


        countryCode:
            selectedCountry?.code || "",

        countryName:
            selectedCountry?.name || "",

        subdivisionCode:
            selectedSubdivision?.code || "",

        subdivisionName:
            selectedSubdivision?.name || "",

        // Readable aliases remain temporarily for legacy consumers.
        state:
            selectedSubdivision?.name || unmappedEditSubdivision,


        zip:
            document
                .getElementById(
                    "zip"
                )
                .value
                .trim(),


        country:
            selectedCountry?.name || unmappedEditCountry,


        about:
            document
                .getElementById(
                    "about"
                )
                .value
                .trim(),


        dogSports:
            Array.from(
                dogSportsCheckboxGrid.querySelectorAll(
                    'input[name="dogSports"]:checked'
                )
            )
                .map((checkbox) => checkbox.value)
                .filter((sportId) =>
                    DOG_SPORT_IDS.has(sportId)
                ),


        privacy: {

            preferredName:
                document.getElementById(
                    "preferredNameVisibility"
                ).value,

            email:
                document.getElementById(
                    "emailVisibility"
                ).value,

            phone:
                document.getElementById(
                    "phoneVisibility"
                ).value,

            location:
                document.getElementById(
                    "locationVisibility"
                ).value,

            about:
                document.getElementById(
                    "aboutVisibility"
                ).value

        },


        profileCompleted:
            true,


        updatedAt:
            new Date().toISOString()

    };


    // If the member selected a photo,
    // save its Storage path in Firestore.

    if (
        profilePhotoMarkedForRemoval &&
        !selectedPhoto
    ) {

        profileData.profilePhotoPath =
            deleteField();

        profileData.profilePhotoUpdatedAt =
            deleteField();

    } else if (profilePhotoPath) {

        profileData.profilePhotoPath =
            profilePhotoPath;

        if (selectedPhoto) {

            profileData.profilePhotoUpdatedAt =
                new Date().toISOString();

        }

    }


    const profilePhotoUpdatedAt =
        selectedPhoto
            ? profileData.profilePhotoUpdatedAt
            : userData.profilePhotoUpdatedAt;

    const memberProfileSourceData = {
        ...userData,
        ...profileData,
        email:
            user.email ||
            userData.email ||
            "",
        profilePhotoPath:
            profilePhotoPath || null,
        profilePhotoUpdatedAt:
            profilePhotoPath
                ? profilePhotoUpdatedAt
                : null
    };

    const memberProfileData =
        buildMemberProfileData(
            user.uid,
            memberProfileSourceData
        );

    const memberProfileRef =
        doc(
            db,
            "memberProfiles",
            user.uid
        );

    const profileWriteBatch =
        writeBatch(db);


    profileWriteBatch.set(
        userRef,
        profileData,
        {
            merge: true
        }
    );

    // Replace the sanitized document so fields that
    // are now private cannot remain from an earlier save.
    profileWriteBatch.set(
        memberProfileRef,
        memberProfileData
    );


    await profileWriteBatch.commit();


    editProfileMessage.textContent =
        "Your profile has been saved successfully.";


    console.log(
        "Edit Profile changes saved."
    );


    setTimeout(
        () => {

            window.location.href =
                "profile.html";

        },
        700
    );


                    } catch (error) {

                        console.error(error);

                        editProfileMessage.textContent =
                            "We couldn't save your profile. Please try again.";

                    }

                }
            );

        }
    );

}


// ------------------------------------
// Log Out
// ------------------------------------

const logoutButton =
    document.getElementById("logoutButton");


if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        async () => {

            try {

                await signOut(auth);

                window.location.href =
                    "index.html";

            } catch (error) {

                console.error(error);

            }

        }
    );

}
