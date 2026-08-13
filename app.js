import {
    firebaseApp,
    db,
    storage
} from "./firebase-config.js";

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
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";


const auth = getAuth(firebaseApp);


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


            try {

                const userCredential =
                    await createUserWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                await sendEmailVerification(
                    userCredential.user
                );


                message.textContent =
                    "Your account has been created. Please check your email to verify your account.";


                createAccountForm.reset();


            } catch (error) {

                console.error(error);


                message.textContent =
                    "We couldn't create your account. Please check your information and try again.";

            }

        }
    );

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


                const userRef =
                    doc(db, "users", user.uid);


                const userSnapshot =
                    await getDoc(userRef);


                if (!userSnapshot.exists()) {

                    await setDoc(
                        userRef,
                        {
                            email: user.email,
                            profileCompleted: false,
                            createdAt:
                                new Date().toISOString()
                        }
                    );


                    console.log(
                        "New user profile created in Firestore."
                    );


                    window.location.href =
                        "profile.html";


                    return;

                }


                console.log(
                    "Existing user profile found in Firestore."
                );


                window.location.href =
    "profile.html";

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

                    await sendEmailVerification(user);


                    message.textContent =
                        "A new verification email has been sent. Please check your email.";

                } catch (error) {

                    console.error(error);


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
                profileData.state,
                profileData.zip,
                profileData.country
            ],
            cityState: [
                profileData.city,
                profileData.state
            ],
            state: [
                profileData.state
            ],
            country: [
                profileData.country
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


const buildMemberProfileData =
    (uid, sourceData) => {

        const privacy =
            sourceData.privacy || {};

        const firstName =
            sourceData.firstName || "";

        const lastName =
            sourceData.lastName || "";

        const preferredName =
            sourceData.preferredName || "";

        const locationVisibility =
            privacy.location || "state";

        const memberProfileData = {
            uid,
            firstName,
            lastName,
            preferredName,
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
                sourceData.membershipStatus ||
                "No Membership",
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
                memberData.membershipStatus;


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


            const requestedProfileOwnerId =
                new URLSearchParams(
                    window.location.search
                )
                    .get("id")
                    ?.trim();

            const profileOwnerId =
                requestedProfileOwnerId ||
                authenticatedUser.uid;

            const isOwner =
                profileOwnerId ===
                authenticatedUser.uid;


            editProfileButton.style.display =
                isOwner
                    ? "inline-block"
                    : "none";


            try {

                const profileOwnerRef =
                    doc(
                        db,
                        isOwner
                            ? "users"
                            : "memberProfiles",
                        profileOwnerId
                    );

                const profileOwnerSnapshot =
                    await getDoc(profileOwnerRef);


                if (!profileOwnerSnapshot.exists()) {

                    profileMessage.textContent =
                        "We couldn't find this member profile.";

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
    isOwner
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


document.getElementById(
    "profileLocation"
).textContent =
    profileLocation;


document.getElementById(
    "profileFullLocation"
).textContent =
    profileLocation || "Not provided";


// -------------------------
// Contact
// -------------------------

const profileOwnerEmail =
    profileOwnerData.email ||
    (isOwner
        ? authenticatedUser.email
        : "");


if (
    isOwner ||
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
    isOwner ||
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
    isOwner &&
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
    !isOwner &&
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

                const wbaRolesContainer =
                    document.getElementById(
                        "wbaRoles"
                    );


                if (wbaRoles.length > 0) {

                    wbaRolesContainer.replaceChildren();


                    wbaRoles.forEach((role) => {

                        const roleName =
                            typeof role === "string"
                                ? role
                                : role?.name;


                        if (!roleName) {
                            return;
                        }


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
                    profileOwnerData.membershipStatus ||
                    "No Membership";


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


                console.log(
                    "Member profile display loaded."
                );


            } catch (error) {

                console.error(error);


                profileMessage.textContent =
                    isOwner
                        ? "We couldn't load your profile information."
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
                    "state"
                ).value =
                    userData.state || "";


                document.getElementById(
                    "zip"
                ).value =
                    userData.zip || "";


                document.getElementById(
                    "country"
                ).value =
                    userData.country || "";


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


        state:
            document
                .getElementById(
                    "state"
                )
                .value
                .trim(),


        zip:
            document
                .getElementById(
                    "zip"
                )
                .value
                .trim(),


        country:
            document
                .getElementById(
                    "country"
                )
                .value
                .trim(),


        about:
            document
                .getElementById(
                    "about"
                )
                .value
                .trim(),


        privacy: {

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
