"""Build the two-sheet Mexico brochure. Panel order: outside 3/6/1, inside 2/4/5."""
from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'metro-mexico-assets'
OUTPUT = ROOT.parent / 'Metro-Relief-Mexico-City-Brochure-2027.pdf'
METRO_LOGO = ROOT.parents[2] / 'MetroRelief/brand/metro-relief-logo.png'
INK = HexColor('#17232C')
ORANGE = HexColor('#F3501D')
# Sampled from the blue lower body of Metro Relief's saved bus photograph.
BUS_BLUE = HexColor('#0077AE')
PALE = HexColor('#F3F4F4')
MUTED = HexColor('#536777')
W, H = 792, 612
c = canvas.Canvas(str(OUTPUT), pagesize=(W, H))
c.setTitle('Metro Relief Mexico City Brochure 2027')
c.setAuthor('Metro Relief / Hope Sojourns')
c.setSubject('Vision 25 in 5; Mexico City journeys; revised October 29, 2026')
checks = []

def rect(x, top, w, h, color):
    c.setFillColor(color)
    c.rect(x, H-top-h, w, h, fill=1, stroke=0)

def para(text, x, top, width=216, size=11.2, leading=14.5, bold=False, color=INK):
    style = ParagraphStyle('p', fontName='Helvetica-Bold' if bold else 'Helvetica',
                           fontSize=size, leading=leading, textColor=color,
                           spaceBefore=0, spaceAfter=0)
    p = Paragraph(text, style)
    _, height = p.wrap(width, 700)
    assert top + height <= 602, (text[:40], top, height)
    p.drawOn(c, x, H-top-height)
    checks.append((c.getPageNumber(),text[:50],top,top+height))
    return top+height

def rule(x, top, width=216):
    rect(x, top, width, 3, ORANGE)

def eyebrow(text, x, top=50, width=216):
    rect(x,32,35,5,ORANGE)
    para(text,x,top,width,8.1,10,bold=True)

def image(path,x,top,w,h):
    c.drawImage(str(path),x,H-top-h,w,h,mask='auto',preserveAspectRatio=True,anchor='c')

def link(url,x,top,w,h):
    c.linkURL(url,(x,H-top-h,x+w,H-top),relative=0,thickness=0)

# OUTSIDE: revised former panel 2 now occupies panel 3 (fold-in flap).
rect(0,0,258,612,PALE)
eyebrow("MEXICO CITY / GOD'S KITCHEN",24,width=210)
t=para('Metro Relief<br/>25 in 5 - Mexico City',24,84,210,21.5,25,bold=True)
t=para("Step into Mexico City as part of Metro Relief's 25 in 5 goal. Come with a heart to serve alongside God's Kitchen, supporting local ministry to people experiencing <b>homelessness</b>, <b>displaced families</b> and <b>refugees</b>, and <b>people rebuilding</b> their <b>lives</b> after <b>addiction</b>.",24,t+16,210,10.2,13.2)
t=para("25 in 5 is Metro Relief's goal to help impact 25 communities worldwide in five years. Part of founder Austin Bonds' vision, it shares Metro Relief's outreach model through local partnerships, mentoring, and training leaders to serve their communities.",24,t+12,210,10.2,13.2)
rule(24,t+14,210)
t=para('Come ready to participate.',24,t+27,210,12.3,15,bold=True)
for head,body in [
    ('Serve practically','Help with partner-directed outreach, hospitality, and meal service as needs and opportunities allow.'),
    ('Build relationships','Listen, encourage, and treat each person as a neighbor with a story worth hearing.'),
    ('Learn and reflect','Experience a different culture, grow in faith, and bring what you learn into everyday life.')]:
    t=para(head,24,t+12,210,10.6,13,bold=True)
    t=para(body,24,t+4,210,10.1,13)
para('Local leaders shape the work. Come ready to listen, learn, and serve with flexibility.',24,571,210,8.2,10.5,color=MUTED)

# Panel 6: contact / QR panel.
image(METRO_LOGO,284,26,66,66)
para('BEGIN THE CONVERSATION',364,42,154,8.1,10,bold=True)
para('Metro Relief<br/>Mexico journeys',364,64,154,12,16,bold=True)
para('Come with us.<br/>Help someone go.',284,130,216,24,28,bold=True)
para('Join as an individual, bring your church or team, or help another traveler take part.',284,198,216,11.2,14.5)
# Logo sits in the existing open space, above the original QR without shrinking it.
image(ASSETS/'hope-sojourns-logo.png',289,245,68,37.9)
qr=json.loads((ASSETS/'original-qr-rectangles.json').read_text())
for x,y,w,h in qr:
    rect(x,y,w,h,INK)
para('Explore Mexico City.<br/>Share your interest.',377,292,136,10.4,14,bold=True)
para('Journey coordination:<br/>Hope Sojourns',377,334,136,9.5,12.5)
para('HopeSojourns.com',284,378,216,16,19,bold=True)
para('HopeSojourns.com/schedule/',284,404,216,10,13)
link('https://hopesojourns.com/schedule/',284,375,216,43)
rule(284,428)
para('GIVE HOPE. HELP SOMEONE GO.',284,445,216,8.1,10,bold=True)
para("Support Metro Relief's outreach through the Donate option at MetroRelief.org. To sponsor all or part of a traveler's journey, contact us to arrange your support.",284,469,216,10.5,13.7)
para('MetroRelief.org',284,527,216,12,15,bold=True)
link('https://www.metrorelief.org/',284,525,216,19)
para('214-705-3555',284,550,216,10.5,13)
para('Metro Relief, Inc. | 501(c)(3) nonprofit',284,577,216,8,10,color=MUTED)

# Panel 1: cover, using the bus blue for the large tile.
x=533.5
rect(x,0,W-x,H,BUS_BLUE)
rect(x,0,W-x,132,white)
image(METRO_LOGO,604,12,112,112)
image(ASSETS/'mexico-city-family.png',x,132.64,W-x,149.71)
rect(x,283,W-x,4,ORANGE)
para('MEXICO JOURNEYS / 2027',550,304,216,8.1,10,bold=True,color=white)
para('MEXICO<br/>CITY',550,333,216,32,34,bold=True,color=white)
para('Come serve. Leave changed.',550,414,216,13,16,bold=True,color=white)
para("Serving alongside God's Kitchen",550,437,216,11,14,color=white)
para('JANUARY 9-14, 2027',550,461,216,13.3,16,bold=True,color=white)
para('$1,500',550,488,128,29,34,bold=True,color=white)
para('per traveler',666,503,100,9.8,12,color=white)
para('RUN AND FACILITATED BY',550,527,216,8.1,10,bold=True,color=white)
rect(550,543,217,51,white)
image(ASSETS/'hope-sojourns-logo.png',612,544,88,49.04)
c.showPage()

# INSIDE: former panel 3 moves here to panel 2.
eyebrow('THE HEART OF THE JOURNEY',24)
t=para('Hope moves<br/>toward people.',24,87,216,25,28,bold=True)
t=para('Metro Relief serves people experiencing homelessness through mobile outreach and personal connection. We move toward our neighbors, listen to their stories, and help them take practical steps toward stability.',24,158,216,11.2,14.5)
rule(24,260)
para('One purpose. Shared work.',24,286,216,14,17,bold=True)
para('Metro Relief has partnered with Hope Sojourns to run and facilitate our Mexico journeys.',24,316,216,11.6,15.5,bold=True)
para("Together, we bring willing travelers alongside God's Kitchen in Mexico City to support local ministry and build meaningful relationships.",24,375,216,11.2,14.5)
para('Go ready to listen.',24,453,216,11.2,14,bold=True)
para('Learn from local leaders. Serve with humility. Treat every person as a neighbor with gifts, agency, and a story worth hearing.',24,475,216,10.7,14)
para("Support Hope Sojourns' work:<br/>HopeSojourns.com/giving/",24,540,216,9.4,12)
link('https://hopesojourns.com/giving/',24,540,216,25)
para('LISTEN. CONNECT. SERVE. GROW.',24,580,216,8,10,bold=True)

# Panel 4: dates and a stronger price treatment.
rect(264,0,264,H,PALE)
eyebrow('SIX MEXICO JOURNEYS PLANNED',288)
para('Start 2027<br/>with purpose.',288,87,216,25,28,bold=True)
rect(288,158,216,95,BUS_BLUE)
rect(288,158,216,5,ORANGE)
para('FIRST AVAILABLE JOURNEY',301,177,190,8.3,11,bold=True,color=white)
para('January 9-14',301,198,190,22,26,bold=True,color=white)
para('2027 | Mexico City',301,231,190,12,15,color=white)
# White price tile, orange edge, larger orange numerals, clear supporting label.
rect(288,268,216,72,white)
rect(288,268,4,72,ORANGE)
para('$1,500',301,276,190,37,41,bold=True,color=ORANGE)
para('per traveler',303,319,188,10.3,13,bold=True)
para('Ask us for the full cost breakdown, payment schedule, and travel arrangements before registering.',288,363,216,11.2,14.5)
rule(288,430)
para('MORE OPPORTUNITIES IN 2027',288,451,216,8.1,10,bold=True)
t=para("This date doesn't work",288,476,216,17.8,23,bold=True)
para("for you and your team, let's build a journey together.",288,t+5,216,11.2,14)
para('Additional journeys are being planned. Tell us which month works for you or your group.',288,541,216,10.7,13)
para('Exact dates and availability for additional journeys will be confirmed as plans are finalized.',288,574,216,7.8,9.7,color=MUTED)

# Panel 5: journey partner (content retained).
eyebrow('MEET OUR JOURNEY PARTNER',552)
para('Hope Sojourns',552,87,216,24,28,bold=True)
para("Metro Relief's Mexico journey partner connects people with purposeful opportunities for faith, service, learning, and lasting relationship.",552,128,216,11.2,14.5)
para('Three streams of service',552,204,216,14,18,bold=True)
for top,heading,body in [
    (239,'01 Mission journeys','Short-term opportunities for individuals, churches, and teams to serve alongside local ministries.'),
    (313,'02 Internships','Extended opportunities for students and graduates to connect learning, skills, and meaningful service.'),
    (387,'03 Corporate humanitarian journeys','Purposeful service experiences for businesses and teams seeking connection, perspective, and practical impact.')]:
    end=para(heading,552,top,216,10.8,14,bold=True)
    para(body,552,end+7,216,10.5,14)
rule(552,465)
para('Beyond Mexico',552,488,216,14,18,bold=True)
para('Explore Hope Sojourns opportunities in Athens, Greece, and England. Ask about current dates and a journey for your group.',552,520,216,10.5,14)
para('Hope Sojourns is a ministry of Christian Steps Ministries.<br/>HopeSojourns.com',552,570,216,7.8,10,color=MUTED)
c.save()
print('Created',OUTPUT)
print('Text blocks:',len(checks),'| maximum bottom:',max(row[3] for row in checks))
