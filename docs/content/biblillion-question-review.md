# Biblillion question review

Reviewed November 25, 2026. Bank 2026-11-25.1 contains 210 prompts and 991 canonical answers, plus spelling/translation aliases. The original 14 prompts are retained for saved-round compatibility; 196 prompts were added.

References and answer sets were checked against the publisher's [World English Bible Protestant edition](https://ebible.org/engwebp/), including its [book index and edition information](https://ebible.org/find/details.php?id=engwebp). The publisher identifies the text as [public domain](https://ebible.org/engwebp/copyright.htm). Source download: https://ebible.org/Scriptures/engwebp_vpl.zip (SHA-256 8970a1482027f9417305ed3a4ff5166548fb36ad2dcdad29c041de294c3ac506). Full Bible files are local review material and are not included in this repository.

tools/check-biblillion-scripture.py verifies the added prompts' verse ranges against publisher XML and flags answers without a literal canonical-name/alias match for editorial review. Literal matching is supporting evidence, not proof of a complete or correctly scoped question. Review included the accepted lists, prompt scope and notes. Corrections included removing Abiezer from the Gideon family question, removing Berea from the Athens passage, widening Ruth's reference to include Naomi, and widening Naaman's river reference to include both the instruction and response.

Two lexical exceptions remain intentionally reviewed:

- The four Gospel book names are book headings rather than words appearing in their opening verses. The publisher's book index confirms the titles. The question asks for book names, not disputed authorship claims.
- Colossians 3:12 uses translation-dependent terms. [NIV](https://www.biblegateway.com/passage/?search=Colossians+3%3A12&version=NIV) has humility/gentleness/patience; WEBP has lowliness/humility/perseverance. Reviewed aliases cover these differences. Humility and gentleness have equal points so overlapping English renderings do not create a score penalty.

Other translation variants are explicit aliases, including personal-name spellings, place names and older English terms. Short or ambiguous names require clarification. Conservative typo matching never creates new accepted answers; it resolves only against the reviewed answer set. Reveals show canonical spelling and Scripture links.

Familiarity points (35/50/65/85/100) are editorial game estimates within each prompt. They are not measured probabilities, spiritual importance or assessments of readiness for mission work. Opted-in answer-choice counts in MMT are a limited sample and do not automatically update scores. All notes and devotional starters require editorial judgment; popularity does not establish theology.

When editing: verify complete passage context, list boundaries, aliases and collisions; preserve legacy progress; update BANK_VERSION for answer/score changes; run bank, daily-cycle, spelling and Worker validation checks. Recheck sources when changing factual content.

## Broad-question and difficulty revision — November 25, 2026

Bank 2026-11-25.2 adds 76 broad prompts for 286 total questions. Broad answer pools cover common cities, people, rulers, books, nature, everyday objects, Gospel stories and Christian practices; source passages accompany accepted answers. Shared aliases are checked for collisions. Generic first names can be valid for broad person prompts while a focused apostle prompt still requires distinguishing repeated names. Common alternatives such as Pharaoh, Saul/Paul, John Mark, and familiar spelling/translation variants are included deliberately. The accepted bank is finite; correction links support additions without declaring unrecognized answers unbiblical.

The church-family question is explicitly historical knowledge, supported by the World Council of Churches church-family directory and member-church descriptions (https://www.oikoumene.org/church-families and https://www.oikoumene.org/member-churches). It includes named traditions and independent churches without ranking their theology. No denomination is presented as having existed under that modern name in Bible times. Book-title questions use the publisher's 66-book index. Narrative actions, occupations, miracles and parable titles are original descriptive labels; a lexical miss is expected when the passage uses a pronoun, another translation or describes an action rather than naming it. References were checked for existence, and scope/translation review corrected overly narrow ranges and common-name omissions. Do not treat lexical matching alone as editorial approval.

Difficulty is an editorial estimate of prompt accessibility, independent of the rarity score of any answer. Every question has an easy/medium/hard rating; the narrow sender-in-letter-openings question remains hard. New rounds have three or four broad questions, at least four easy prompts and at most one hard prompt. Rare answers are optional discoveries, not required for correctness. Balanced decks select 140 distinct prompts per 20-day cycle; the full catalog is larger. Existing accepted answers and scores in the prior banks are preserved.
