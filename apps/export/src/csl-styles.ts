import type { CslStyle } from "@rhema/contracts";

// §13.4 — the five MVP CSL styles (APA, MLA, Chicago author-date, Harvard, Vancouver), vendored
// INLINE so the pruned runtime bundle carries them without a filesystem layout dependency. They
// are Rhema-authored minimal-but-correct CSL 1.0.2 styles covering the item types the bibliography
// stores emit (article-journal, book, chapter, webpage/report): the in-text layout + the reference
// layout per style family. Written here rather than vendoring the upstream Zotero styles repo —
// that collection is CC-BY-SA, outside the license allowlist; authoring avoids a new exception.
// The rendered output is golden-tested per style in export.test.ts through the real pandoc
// `--citeproc` (the BSD-licensed engine — citeproc-js's AGPL is rejected).

const INFO = (id: string, title: string) =>
  `  <info>\n    <title>${title}</title>\n    <id>${id}</id>\n    <updated>2026-09-26T00:00:00+00:00</updated>\n  </info>`;

const STYLE_OPEN = `<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" delimiter-precedes-et-al="contextual">`;

// --------------------------------------------------------------------------------------------
// APA (7th ed., minimal): in-text (Author, Year); reference "Family, I. I. (Year). Title.
// *Container*, *vol*(issue), pages. https://doi.org/…".
// --------------------------------------------------------------------------------------------
const APA = `${STYLE_OPEN}
${INFO("rhema-apa", "American Psychological Association 7th edition (Rhema minimal)")}
  <macro name="author">
    <names variable="author">
      <name and="symbol" initialize-with=". " delimiter=", " delimiter-precedes-last="always" name-as-sort-order="all" sort-separator=", "/>
      <substitute>
        <text variable="title" form="short"/>
      </substitute>
    </names>
  </macro>
  <macro name="author-short">
    <names variable="author">
      <name and="symbol" delimiter=", " delimiter-precedes-last="always" form="short"/>
    </names>
  </macro>
  <macro name="issued">
    <date variable="issued">
      <date-part name="year"/>
    </date>
  </macro>
  <macro name="title">
    <choose>
      <if type="book">
        <text variable="title" font-style="italic"/>
      </if>
      <else>
        <text variable="title"/>
      </else>
    </choose>
  </macro>
  <macro name="container">
    <group delimiter=" ">
      <text variable="container-title" font-style="italic"/>
      <group delimiter="">
        <text variable="volume" font-style="italic"/>
        <text variable="issue" prefix="(" suffix=")"/>
      </group>
      <text variable="page" prefix=", "/>
    </group>
  </macro>
  <citation et-al-min="3" et-al-use-first="1" disambiguate-add-year-suffix="true">
    <sort>
      <key macro="author-short"/>
      <key macro="issued"/>
    </sort>
    <layout prefix="(" suffix=")" delimiter="; ">
      <group delimiter=", ">
        <text macro="author-short"/>
        <text macro="issued"/>
      </group>
    </layout>
  </citation>
  <bibliography hanging-indent="true" entry-spacing="0" line-spacing="2">
    <sort>
      <key macro="author"/>
      <key macro="issued"/>
      <key variable="title"/>
    </sort>
    <layout suffix=".">
      <group delimiter=". ">
        <text macro="author"/>
        <text macro="issued" prefix="(" suffix=")"/>
        <text macro="title"/>
        <text macro="container"/>
      </group>
      <text variable="DOI" prefix=" https://doi.org/"/>
      <text variable="URL" prefix=" "/>
    </layout>
  </bibliography>
</style>`;

// --------------------------------------------------------------------------------------------
// MLA (9th ed., minimal): in-text (Author <locator>); works-cited "Family, Given. \"Title.\"
// *Container*, vol. X, no. Y, Year, pp. Z." / "*Title*. Publisher, Year."
// --------------------------------------------------------------------------------------------
const MLA = `${STYLE_OPEN}
${INFO("rhema-mla", "Modern Language Association 9th edition (Rhema minimal)")}
  <macro name="author">
    <names variable="author">
      <name and="text" initialize-with=". " delimiter=", " delimiter-precedes-last="always" name-as-sort-order="first"/>
    </names>
  </macro>
  <macro name="author-short">
    <names variable="author">
      <name and="text" delimiter=", " delimiter-precedes-last="always" form="short"/>
    </names>
  </macro>
  <macro name="issued">
    <date variable="issued">
      <date-part name="year"/>
    </date>
  </macro>
  <macro name="title">
    <choose>
      <if type="book">
        <text variable="title" font-style="italic"/>
      </if>
      <else>
        <text variable="title" quotes="true"/>
      </else>
    </choose>
  </macro>
  <macro name="container">
    <group delimiter=", ">
      <text variable="container-title" font-style="italic"/>
      <text variable="volume" prefix="vol. "/>
      <text variable="issue" prefix="no. "/>
      <text macro="issued"/>
      <text variable="page" prefix="pp. "/>
      <text variable="publisher"/>
    </group>
  </macro>
  <citation et-al-min="3" et-al-use-first="1" disambiguate-add-year-suffix="true">
    <layout prefix="(" suffix=")" delimiter="; ">
      <group delimiter=" ">
        <text macro="author-short"/>
        <text variable="locator"/>
      </group>
    </layout>
  </citation>
  <bibliography hanging-indent="true" entry-spacing="0" line-spacing="2">
    <sort>
      <key macro="author"/>
      <key variable="title"/>
    </sort>
    <layout suffix=".">
      <group delimiter=". ">
        <text macro="author"/>
        <text macro="title"/>
        <text macro="container"/>
      </group>
    </layout>
  </bibliography>
</style>`;

// --------------------------------------------------------------------------------------------
// Chicago author-date (17th ed., minimal): in-text (Author Year) — NO comma; reference
// "Family, Given. Year. \"Title.\" *Container* vol (issue): pages."
// --------------------------------------------------------------------------------------------
const CHICAGO = `${STYLE_OPEN}
${INFO("rhema-chicago-author-date", "Chicago Manual of Style 17th edition, author-date (Rhema minimal)")}
  <macro name="author">
    <names variable="author">
      <name and="text" initialize-with=". " delimiter=", " delimiter-precedes-last="always" name-as-sort-order="first"/>
    </names>
  </macro>
  <macro name="author-short">
    <names variable="author">
      <name and="text" delimiter=", " delimiter-precedes-last="always" form="short"/>
    </names>
  </macro>
  <macro name="issued">
    <date variable="issued">
      <date-part name="year"/>
    </date>
  </macro>
  <macro name="title">
    <choose>
      <if type="book">
        <text variable="title" font-style="italic"/>
      </if>
      <else>
        <text variable="title" quotes="true"/>
      </else>
    </choose>
  </macro>
  <macro name="container">
    <group delimiter=" ">
      <text variable="container-title" font-style="italic"/>
      <group delimiter=" ">
        <text variable="volume"/>
        <text variable="issue" prefix="(" suffix=")"/>
      </group>
      <text variable="page" prefix=": "/>
    </group>
  </macro>
  <citation et-al-min="4" et-al-use-first="1" disambiguate-add-year-suffix="true">
    <layout prefix="(" suffix=")" delimiter="; ">
      <group delimiter=" ">
        <text macro="author-short"/>
        <text macro="issued"/>
      </group>
    </layout>
  </citation>
  <bibliography hanging-indent="true" entry-spacing="0">
    <sort>
      <key macro="author"/>
      <key macro="issued"/>
      <key variable="title"/>
    </sort>
    <layout suffix=".">
      <group delimiter=". ">
        <text macro="author"/>
        <text macro="issued"/>
        <text macro="title"/>
        <text macro="container"/>
      </group>
    </layout>
  </bibliography>
</style>`;

// --------------------------------------------------------------------------------------------
// Harvard (Cite Them Right family, minimal): in-text (Author, Year); reference
// "Family, I. (Year) 'Title', *Container*, vol(issue), pp. Z."
// --------------------------------------------------------------------------------------------
const HARVARD = `${STYLE_OPEN}
${INFO("rhema-harvard", "Harvard reference style (Rhema minimal)")}
  <macro name="author">
    <names variable="author">
      <name and="text" initialize-with="." delimiter=", " delimiter-precedes-last="always" name-as-sort-order="first"/>
    </names>
  </macro>
  <macro name="author-short">
    <names variable="author">
      <name and="text" delimiter=", " delimiter-precedes-last="always" form="short"/>
    </names>
  </macro>
  <macro name="issued">
    <date variable="issued">
      <date-part name="year"/>
    </date>
  </macro>
  <macro name="title">
    <choose>
      <if type="book">
        <text variable="title" font-style="italic"/>
      </if>
      <else>
        <text variable="title" quotes="true"/>
      </else>
    </choose>
  </macro>
  <macro name="container">
    <group delimiter=", ">
      <text variable="container-title" font-style="italic"/>
      <group delimiter="">
        <text variable="volume"/>
        <text variable="issue" prefix="(" suffix=")"/>
      </group>
      <text variable="page" prefix="pp. "/>
      <text variable="publisher"/>
    </group>
  </macro>
  <citation et-al-min="4" et-al-use-first="1" disambiguate-add-year-suffix="true">
    <layout prefix="(" suffix=")" delimiter="; ">
      <group delimiter=", ">
        <text macro="author-short"/>
        <text macro="issued"/>
      </group>
    </layout>
  </citation>
  <bibliography hanging-indent="true" entry-spacing="0">
    <sort>
      <key macro="author"/>
      <key macro="issued"/>
      <key variable="title"/>
    </sort>
    <layout suffix=".">
      <group delimiter=". ">
        <text macro="author"/>
        <text macro="issued" prefix="(" suffix=")"/>
        <text macro="title"/>
        <text macro="container"/>
      </group>
    </layout>
  </bibliography>
</style>`;

// --------------------------------------------------------------------------------------------
// Vancouver (ICMJE-ish, minimal): numeric in-text (1); numbered reference
// "1. Family II. Title. Container. Year;vol(issue):pages."
// --------------------------------------------------------------------------------------------
const VANCOUVER = `${STYLE_OPEN}
${INFO("rhema-vancouver", "Vancouver (numeric) reference style (Rhema minimal)")}
  <macro name="author">
    <names variable="author">
      <name and="text" initialize-with="" delimiter=", " delimiter-precedes-last="always" sort-separator=" "/>
    </names>
  </macro>
  <macro name="issued">
    <date variable="issued">
      <date-part name="year"/>
    </date>
  </macro>
  <macro name="container">
    <group delimiter="">
      <text variable="container-title" suffix=". " form="short"/>
      <group delimiter=";">
        <text macro="issued"/>
        <group delimiter="">
          <text variable="volume"/>
          <text variable="issue" prefix="(" suffix=")"/>
        </group>
      </group>
      <text variable="page" prefix=":"/>
    </group>
  </macro>
  <citation collapse="citation-number">
    <sort>
      <key variable="citation-number"/>
    </sort>
    <layout prefix="(" suffix=")" delimiter=",">
      <text variable="citation-number"/>
    </layout>
  </citation>
  <bibliography entry-spacing="0" second-field-align="flush">
    <layout suffix=".">
      <text variable="citation-number" suffix=". "/>
      <group delimiter=". ">
        <text macro="author"/>
        <text variable="title"/>
        <text macro="container"/>
      </group>
    </layout>
  </bibliography>
</style>`;

/** The vendored `.csl` XML per style — written into the pandoc scratch dir for `--csl=<name>.csl`. */
export const CSL_STYLE_XML: Record<CslStyle, string> = {
  apa: APA,
  mla: MLA,
  "chicago-author-date": CHICAGO,
  harvard: HARVARD,
  vancouver: VANCOUVER,
};
