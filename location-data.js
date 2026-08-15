// Country codes follow ISO 3166-1 alpha-2. English display names come from the
// browser's Unicode CLDR data through Intl.DisplayNames. Subdivision codes use
// ISO 3166-2 identifiers. Add or refresh subdivision tables from ISO 3166-2
// when the portal needs controlled region entry for another country.

const COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(" ");

const SUBDIVISIONS = {
    US: `AL|Alabama,AK|Alaska,AZ|Arizona,AR|Arkansas,CA|California,CO|Colorado,CT|Connecticut,DE|Delaware,DC|District of Columbia,FL|Florida,GA|Georgia,HI|Hawaii,ID|Idaho,IL|Illinois,IN|Indiana,IA|Iowa,KS|Kansas,KY|Kentucky,LA|Louisiana,ME|Maine,MD|Maryland,MA|Massachusetts,MI|Michigan,MN|Minnesota,MS|Mississippi,MO|Missouri,MT|Montana,NE|Nebraska,NV|Nevada,NH|New Hampshire,NJ|New Jersey,NM|New Mexico,NY|New York,NC|North Carolina,ND|North Dakota,OH|Ohio,OK|Oklahoma,OR|Oregon,PA|Pennsylvania,RI|Rhode Island,SC|South Carolina,SD|South Dakota,TN|Tennessee,TX|Texas,UT|Utah,VT|Vermont,VA|Virginia,WA|Washington,WV|West Virginia,WI|Wisconsin,WY|Wyoming,AS|American Samoa,GU|Guam,MP|Northern Mariana Islands,PR|Puerto Rico,UM|U.S. Minor Outlying Islands,VI|U.S. Virgin Islands`,
    CA: `AB|Alberta,BC|British Columbia,MB|Manitoba,NB|New Brunswick,NL|Newfoundland and Labrador,NS|Nova Scotia,NT|Northwest Territories,NU|Nunavut,ON|Ontario,PE|Prince Edward Island,QC|Quebec,SK|Saskatchewan,YT|Yukon`,
    AU: `ACT|Australian Capital Territory,NSW|New South Wales,NT|Northern Territory,QLD|Queensland,SA|South Australia,TAS|Tasmania,VIC|Victoria,WA|Western Australia`,
    GB: `ENG|England,NIR|Northern Ireland,SCT|Scotland,WLS|Wales`
};

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

const parseSubdivisions = (countryCode, subdivisionText = "") =>
    subdivisionText
        .split(",")
        .filter(Boolean)
        .map((entry) => {
            const [localCode, name] = entry.split("|");
            return { code: `${countryCode}-${localCode}`, name };
        });

const COUNTRIES = COUNTRY_CODES
    .map((code) => ({
        code,
        name: regionNames.of(code),
        subdivisions: parseSubdivisions(code, SUBDIVISIONS[code])
    }))
    .sort((first, second) => first.name.localeCompare(second.name));

const LEGACY_COUNTRY_ALIASES = new Map([
    ["america", "US"],
    ["u.s.", "US"],
    ["u.s.a.", "US"],
    ["usa", "US"],
    ["united states of america", "US"],
    ["uk", "GB"],
    ["great britain", "GB"]
]);

const normalize = (value) => String(value || "").trim().toLocaleLowerCase();

const getCountry = (countryCode) =>
    COUNTRIES.find((country) => country.code === countryCode) || null;

const resolveCountry = (countryCode, legacyCountry) => {
    const canonicalCode = String(countryCode || "").trim().toUpperCase();
    if (getCountry(canonicalCode)) return getCountry(canonicalCode);

    const normalizedLegacy = normalize(legacyCountry);
    const aliasCode = LEGACY_COUNTRY_ALIASES.get(normalizedLegacy);
    if (aliasCode) return getCountry(aliasCode);

    return COUNTRIES.find((country) => normalize(country.name) === normalizedLegacy) || null;
};

const resolveSubdivision = (country, subdivisionCode, legacySubdivision) => {
    if (!country) return null;
    const canonicalCode = String(subdivisionCode || "").trim().toUpperCase();
    const normalizedLegacy = normalize(legacySubdivision);
    return country.subdivisions.find((subdivision) =>
        subdivision.code === canonicalCode ||
        normalize(subdivision.name) === normalizedLegacy ||
        normalize(subdivision.code.split("-").slice(1).join("-")) === normalizedLegacy
    ) || null;
};

const populateCountrySelect = (select, selectedCode = "") => {
    select.replaceChildren(new Option("Select Country", ""));
    COUNTRIES.forEach((country) => select.add(new Option(country.name, country.code)));
    select.value = selectedCode;
};

const populateSubdivisionSelect = (select, countryCode, selectedCode = "") => {
    const country = getCountry(countryCode);
    select.replaceChildren();

    if (!country) {
        select.add(new Option("Select Country First", ""));
        select.disabled = true;
        return;
    }

    if (!country.subdivisions.length) {
        select.add(new Option("Not Applicable", ""));
        select.disabled = true;
        return;
    }

    select.add(new Option("Select State / Province / Region", ""));
    country.subdivisions.forEach((subdivision) =>
        select.add(new Option(subdivision.name, subdivision.code))
    );
    select.disabled = false;
    select.value = selectedCode;
};

export {
    COUNTRIES,
    getCountry,
    resolveCountry,
    resolveSubdivision,
    populateCountrySelect,
    populateSubdivisionSelect
};
