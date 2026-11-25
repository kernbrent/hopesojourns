// Each score is an editorial familiarity estimate within this prompt, not a play statistic.
// References establish eligibility. Explanations are original paraphrases, not Bible quotations.
import {EXPANDED_QUESTIONS} from './expanded-bank.js';
export const BANK_VERSION = '2026-11-25.1';
export const LEGACY_BANK_VERSION = '2026-11-24.1';
const a = (name, points, ref, note, aliases = []) => ({name, points, ref, note, aliases});
const q = (id, category, prompt, scope, hint, answers) => ({id, category, prompt, scope, hint, answers});
export const QUESTIONS = [
 q('churches','Places & prophecy','Name one of the seven churches addressed in Revelation.','Use the city name from Revelation 2–3.','These churches were in the Roman province of Asia, in what is now western Türkiye.',[
  a('Ephesus',35,'Revelation 2:1','The first of the seven messages addresses the church in Ephesus.'),
  a('Smyrna',65,'Revelation 2:8','Smyrna receives encouragement to remain faithful in suffering.'),
  a('Pergamum',85,'Revelation 2:12','The third message is addressed to Pergamum.',['Pergamos']),
  a('Thyatira',100,'Revelation 2:18','Thyatira is commended for love, faith, service and perseverance, and also corrected.'),
  a('Sardis',85,'Revelation 3:1','The church in Sardis is called to wake up.'),
  a('Philadelphia',65,'Revelation 3:7','Philadelphia is encouraged to hold on to what it has.'),
  a('Laodicea',50,'Revelation 3:14','Laodicea receives the final message of the seven.')]),
 q('apostles','People','Name an apostle listed in Matthew 10.','Use a name in Matthew 10:2–4. For James or Simon, say which one.','Matthew lists six pairs. A distinguishing family name or description helps with repeated names.',[
  a('Peter',35,'Matthew 10:2','Simon Peter appears first in this list.',['Simon Peter','Simon called Peter']),
  a('Andrew',50,'Matthew 10:2','Andrew is introduced as Peter’s brother.'),
  a('James son of Zebedee',50,'Matthew 10:2','This James and John are sons of Zebedee.',['James the son of Zebedee','James Zebedee','James the greater']),
  a('John',35,'Matthew 10:2','John is listed beside his brother James.',['John son of Zebedee']),
  a('Philip',65,'Matthew 10:3','Philip appears in the second group of names.'),
  a('Bartholomew',85,'Matthew 10:3','Bartholomew is explicitly named in Matthew’s list.'),
  a('Thomas',50,'Matthew 10:3','Thomas is one of the twelve listed here.',['Doubting Thomas']),
  a('Matthew',35,'Matthew 10:3','Matthew is identified as the tax collector.',['Matthew the tax collector']),
  a('James son of Alphaeus',100,'Matthew 10:3','Matthew distinguishes this James by naming his father.',['James the son of Alphaeus','James Alphaeus','James son of Alpheus','James the less']),
  a('Thaddaeus',85,'Matthew 10:3','Thaddaeus is named here; some manuscripts also give the name Lebbaeus.',['Thaddeus','Lebbaeus','Judas son of James','Jude']),
  a('Simon the Zealot',85,'Matthew 10:4','This Simon is distinguished from Simon Peter.',['Simon Zealot','Simon the Canaanite','Simon the Cananaean']),
  a('Judas Iscariot',35,'Matthew 10:4','Matthew identifies Judas Iscariot as the one who betrayed Jesus.',['Judas'])]),
 q('fruit','Biblical concepts','Name one aspect of the fruit of the Spirit.','Use the list in Galatians 5:22–23. Common English translation equivalents count.','Paul’s list describes character formed by the Spirit, rather than spiritual gifts.',[
  a('Love',35,'Galatians 5:22','Love opens the list.'),a('Joy',35,'Galatians 5:22','Joy is named alongside love and peace.'),a('Peace',35,'Galatians 5:22','Peace is part of the Spirit’s fruit.'),
  a('Patience',50,'Galatians 5:22','Translations also render this quality as longsuffering.',['Longsuffering','Long suffering','Forbearance']),
  a('Kindness',65,'Galatians 5:22','Kindness expresses care in our treatment of others.',['Gentleness (KJV)']),
  a('Goodness',85,'Galatians 5:22','Goodness is a distinct item in Paul’s list.'),
  a('Faithfulness',65,'Galatians 5:22','Some translations use faith at this point in the list.',['Faith']),
  a('Gentleness',85,'Galatians 5:23','Gentleness is also translated as meekness.',['Meekness']),
  a('Self-control',100,'Galatians 5:23','Self-control closes the list.',['Self control','Temperance'])]),
 q('sons','People & history','Name one of Jacob’s twelve sons.','Use the sons named in Genesis 35:23–26.','Think beyond Joseph: the list groups the sons by their mothers.',[
  a('Reuben',50,'Genesis 35:23','Reuben is Leah’s firstborn son.'),a('Simeon',65,'Genesis 35:23','Simeon is one of Leah’s sons.',['Simon']),a('Levi',50,'Genesis 35:23','Levi is listed among Leah’s sons.'),a('Judah',35,'Genesis 35:23','Judah is one of the sons born to Leah.'),
  a('Issachar',85,'Genesis 35:23','Issachar is listed just before Zebulun.'),a('Zebulun',85,'Genesis 35:23','Zebulun completes this list of Leah’s sons.',['Zabulon']),a('Joseph',35,'Genesis 35:24','Joseph and Benjamin are Rachel’s sons.'),a('Benjamin',50,'Genesis 35:24','Benjamin is Rachel’s younger son.'),
  a('Dan',65,'Genesis 35:25','Dan is a son of Bilhah.'),a('Naphtali',100,'Genesis 35:25','Naphtali is the other son of Bilhah.',['Nephtali']),a('Gad',85,'Genesis 35:26','Gad is one of Zilpah’s sons.'),a('Asher',65,'Genesis 35:26','Asher is also a son of Zilpah.')]),
 q('armor','Biblical concepts','Name an item in the armor of God.','Use the six pieces described in Ephesians 6:14–17. The item or its full phrase counts.','Picture a soldier’s equipment from head to feet, including what is carried.',[
  a('Belt of truth',50,'Ephesians 6:14','Truth is pictured as a belt.',['Belt','Truth','Girdle of truth']),a('Breastplate of righteousness',65,'Ephesians 6:14','Righteousness is pictured as a breastplate.',['Breastplate','Righteousness']),
  a('Shoes of the gospel of peace',100,'Ephesians 6:15','Readiness from the gospel of peace equips the feet.',['Shoes','Feet','Sandals','Gospel of peace','Readiness','Preparation of the gospel of peace']),
  a('Shield of faith',35,'Ephesians 6:16','Faith is pictured as a shield.',['Shield','Faith']),a('Helmet of salvation',50,'Ephesians 6:17','Salvation is pictured as a helmet.',['Helmet','Salvation']),a('Sword of the Spirit',35,'Ephesians 6:17','The sword of the Spirit is identified with the word of God.',['Sword','Word of God','The word of God'])]),
 q('women-genealogy','People & Scripture','Name a woman explicitly named in Matthew’s genealogy of Jesus.','Read Matthew 1:1–16. A woman referred to only by her husband’s name does not count for this prompt.','There are four explicitly named women. Another woman is identified as Uriah’s wife.',[
  a('Tamar',100,'Matthew 1:3','Tamar is named in the line from Judah.'),a('Rahab',85,'Matthew 1:5','Rahab is named as Boaz’s mother.'),a('Ruth',50,'Matthew 1:5','Ruth is named as Obed’s mother.'),a('Mary',35,'Matthew 1:16','Mary is named at the conclusion of the genealogy.',['Mary mother of Jesus','Virgin Mary'])]),
 q('prophets','Books & prophecy','Name a book among the twelve Minor Prophets.','Use the standard English book title, from Hosea through Malachi. “Minor” refers to length, not importance.','These twelve books come after Daniel in the usual Protestant Old Testament order.',[
  a('Hosea',50,'Hosea 1:1','The opening identifies the word of the Lord coming to Hosea.'),a('Joel',65,'Joel 1:1','Joel’s book opens by naming him and his father.'),a('Amos',50,'Amos 1:1','Amos is introduced as a shepherd from Tekoa.'),a('Obadiah',100,'Obadiah 1:1','This short prophetic book begins with Obadiah’s vision.'),
  a('Jonah',35,'Jonah 1:1','Jonah is called to go to Nineveh.'),a('Micah',65,'Micah 1:1','Micah’s message concerns Samaria and Jerusalem.'),a('Nahum',85,'Nahum 1:1','Nahum’s book concerns Nineveh.'),a('Habakkuk',85,'Habakkuk 1:1','The opening identifies Habakkuk as a prophet.',['Habakuk']),
  a('Zephaniah',85,'Zephaniah 1:1','Zephaniah is placed in the reign of Josiah.',['Sofonias']),a('Haggai',85,'Haggai 1:1','Haggai’s opening dates the message to Darius’s second year.',['Aggeus']),a('Zechariah',65,'Zechariah 1:1','Zechariah is introduced as the son of Berechiah.',['Zachariah']),a('Malachi',50,'Malachi 1:1','Malachi’s opening describes a message to Israel.')]),
 q('emperors','Times & history','Name a Roman emperor explicitly named in the New Testament.','Use a personal name, not the general title Caesar. Nero is not explicitly named.','Two appear in Luke’s dating of events; another is named in Acts.',[
  a('Augustus',35,'Luke 2:1','Luke connects the census decree with Caesar Augustus.',['Caesar Augustus','Augustus Caesar','Octavian']),a('Tiberius',85,'Luke 3:1','Luke dates John’s ministry to the fifteenth year of Tiberius Caesar.',['Tiberius Caesar','Caesar Tiberius']),a('Claudius',100,'Acts 11:28; 18:2','Acts names Claudius in connection with a famine and a decree concerning Rome.',['Claudius Caesar','Caesar Claudius'])]),
 q('senders','Authors & letters','Name a person identified as a sender in one of these letter openings.','Use 1 Corinthians 1:1; Philippians 1:1; 1 Thessalonians 1:1; James 1:1; 1 Peter 1:1; or Jude 1:1. This asks about named senders, not debated authorship.','Some openings name more than one person. Look at Paul’s co-senders.',[
  a('Paul',35,'1 Corinthians 1:1','Paul identifies himself in the opening.'),a('Sosthenes',100,'1 Corinthians 1:1','Sosthenes is named with Paul in the greeting.'),a('Timothy',65,'Philippians 1:1','Paul and Timothy are named together.',['Timotheus']),a('Silvanus',85,'1 Thessalonians 1:1','Paul, Silvanus and Timothy are all named.',['Silas']),a('James',50,'James 1:1','James identifies himself as a servant of God and of Jesus Christ.'),a('Peter',35,'1 Peter 1:1','Peter identifies himself as an apostle of Jesus Christ.',['Simon Peter']),a('Jude',65,'Jude 1:1','Jude identifies himself as a servant of Jesus Christ and brother of James.',['Judas'])]),
 q('furnace','People & history','Name one of Daniel’s three friends thrown into the fiery furnace.','Use a Babylonian name or the corresponding Hebrew name in Daniel 1:6–7 and 3.','Daniel is not one of the three thrown into this furnace.',[
  a('Shadrach',35,'Daniel 1:7; 3:20','Hananiah was given the name Shadrach.',['Hananiah']),a('Meshach',65,'Daniel 1:7; 3:20','Mishael was given the name Meshach.',['Mishael']),a('Abednego',100,'Daniel 1:7; 3:20','Azariah was given the name Abednego.',['Abed-nego','Azariah'])]),
 q('cities-matthew','Places','Name a city or town explicitly named in Matthew 2.','Use a settlement name, rather than a region or country. The quoted prophecy counts.','The chapter follows the magi’s visit and Joseph’s family’s movements.',[
  a('Bethlehem',35,'Matthew 2:1','Jesus is born in Bethlehem in Judea.',['Bethlehem of Judea','Bethlehem in Judea']),a('Jerusalem',35,'Matthew 2:1','The magi come to Jerusalem asking about the newborn king.'),a('Ramah',100,'Matthew 2:18','Ramah appears in Matthew’s quotation from Jeremiah.'),a('Nazareth',65,'Matthew 2:23','Joseph’s family settles in Nazareth.')]),
 q('growth','Biblical concepts','Name a quality in Peter’s sequence of growth.','Use the eight qualities in 2 Peter 1:5–7, including the starting quality. Translation equivalents count.','The sequence begins with faith and ends with love.',[
  a('Faith',35,'2 Peter 1:5','Faith begins this sequence.'),a('Virtue',85,'2 Peter 1:5','Virtue is also translated as goodness or moral excellence.',['Goodness','Moral excellence']),a('Knowledge',50,'2 Peter 1:5','Knowledge follows virtue.'),a('Self-control',65,'2 Peter 1:6','Self-control follows knowledge.',['Self control','Temperance']),a('Perseverance',85,'2 Peter 1:6','Perseverance is also rendered steadfastness or patience.',['Steadfastness','Patience','Endurance']),a('Godliness',65,'2 Peter 1:6','Godliness follows perseverance.'),a('Brotherly affection',100,'2 Peter 1:7','Brotherly affection is also rendered brotherly kindness or mutual affection.',['Brotherly kindness','Mutual affection','Brotherly love']),a('Love',35,'2 Peter 1:7','Love completes the sequence.',['Charity'])]),
 q('torah','Books & Scripture','Name a book of the Pentateuch.','Use one of the first five books of the Bible.','Pentateuch means five books. These books are also called the Torah.',[
  a('Genesis',35,'Genesis 1:1','Genesis opens with creation and follows the patriarchs.'),a('Exodus',35,'Exodus 1:1','Exodus follows Israel’s deliverance from Egypt and covenant at Sinai.'),a('Leviticus',100,'Leviticus 1:1','Leviticus opens with instructions spoken to Moses from the tent of meeting.'),a('Numbers',65,'Numbers 1:1','Numbers opens in the wilderness of Sinai.'),a('Deuteronomy',85,'Deuteronomy 1:1','Deuteronomy presents Moses’s words to Israel before entering the land.')]),
 q('persian-kings','Times & history','Name a Persian king explicitly named in Ezra.','Use a king’s personal name in Ezra. Ahasuerus/Xerxes is accepted; different kings called Darius are not distinguished here.','The book names kings in both its narrative and the official correspondence it records.',[
  a('Cyrus',35,'Ezra 1:1','Cyrus’s proclamation opens the book.',['Cyrus the Great','King Cyrus']),a('Darius',65,'Ezra 4:5; 6:1','Darius orders a search for the earlier decree.',['Darius I','Darius the Great']),a('Ahasuerus',100,'Ezra 4:6','Ezra records an accusation at the beginning of Ahasuerus’s reign.',['Xerxes','Xerxes I']),a('Artaxerxes',85,'Ezra 4:7; 7:1','Artaxerxes is named in correspondence and in the account of Ezra.',['Artaxerxes I'])])
 ,...EXPANDED_QUESTIONS
];
export const TIERS = [
 {min:100,name:'Hidden treasure',mark:'✦',description:'Our most unexpected pick in this set.'},
 {min:85,name:'Deep discovery',mark:'◆',description:'A less familiar answer worth digging for.'},
 {min:65,name:'Rare find',mark:'◇',description:'A thoughtful step beyond the usual answer.'},
 {min:50,name:'Fresh find',mark:'✧',description:'A welcome discovery along the way.'},
 {min:0,name:'Familiar favorite',mark:'•',description:'A well-known answer, and still a good find.'}
];
export const tierFor = points => TIERS.find(t=>points>=t.min);
export const scriptureURL = ref => 'https://www.biblegateway.com/passage/?search='+encodeURIComponent(ref)+'&version=WEB';
