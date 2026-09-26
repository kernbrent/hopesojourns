-- Add the supplied hymns to both the reusable Day 1 study and its trip copy.
-- Preserve all existing study text and do not duplicate this section if already present.

UPDATE devotional_library
SET content = replace(content, 'CLOSING PRAYER', 'HYMNS FOR DAY 1

TO GOD BE THE GLORY

1 To God be the glory, great things He hath done,
so loved He the world that He gave us His Son,
who yielded His life an atonement for sin,
and opened the life-gate that all may go in.

Refrain:
Praise the Lord, praise the Lord,
let the earth hear His voice!
Praise the Lord, praise the Lord,
let the people rejoice!
O come to the Father through Jesus the Son,
and give Him the glory, great things He hath done.

2 O perfect redemption, the purchase of blood,
to ev''ry believer the promise of God;
the vilest offender who truly believes,
that moment from Jesus a pardon receives. [Refrain]

3 Great things He hath taught us, great things He hath done,
and great our rejoicing through Jesus the Son;
but purer, and higher, and greater will be
our wonder, our transport, when Jesus we see. [Refrain]

AMAZING GRACE

1. Amazing grace! How sweet the sound
   That saved a wretch like me!
   I once was lost, but now am found;
   Was blind, but now I see.

2. ’Twas grace that taught my heart to fear,
   And grace my fears relieved;
   How precious did that grace appear
   The hour I first believed.

3. Through many dangers, toils, and snares,
   I have already come;
   ’Tis grace hath brought me safe thus far,
   And grace will lead me home.

4. The Lord has promised good to me,
   His Word my hope secures;
   He will my Shield and Portion be,
   As long as life endures.

5. When we’ve been there ten thousand years,
   Bright shining as the sun,
   We’ve no less days to sing God’s praise
   Than when we’d first begun.
' || char(10) || 'CLOSING PRAYER'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = '1df9e9fd-12e8-5325-a4d7-179cd3826dac'
  AND instr(content, 'CLOSING PRAYER') > 0
  AND instr(content, 'HYMNS FOR DAY 1') = 0;

UPDATE trip_content
SET content = replace(content, 'CLOSING PRAYER', 'HYMNS FOR DAY 1

TO GOD BE THE GLORY

1 To God be the glory, great things He hath done,
so loved He the world that He gave us His Son,
who yielded His life an atonement for sin,
and opened the life-gate that all may go in.

Refrain:
Praise the Lord, praise the Lord,
let the earth hear His voice!
Praise the Lord, praise the Lord,
let the people rejoice!
O come to the Father through Jesus the Son,
and give Him the glory, great things He hath done.

2 O perfect redemption, the purchase of blood,
to ev''ry believer the promise of God;
the vilest offender who truly believes,
that moment from Jesus a pardon receives. [Refrain]

3 Great things He hath taught us, great things He hath done,
and great our rejoicing through Jesus the Son;
but purer, and higher, and greater will be
our wonder, our transport, when Jesus we see. [Refrain]

AMAZING GRACE

1. Amazing grace! How sweet the sound
   That saved a wretch like me!
   I once was lost, but now am found;
   Was blind, but now I see.

2. ’Twas grace that taught my heart to fear,
   And grace my fears relieved;
   How precious did that grace appear
   The hour I first believed.

3. Through many dangers, toils, and snares,
   I have already come;
   ’Tis grace hath brought me safe thus far,
   And grace will lead me home.

4. The Lord has promised good to me,
   His Word my hope secures;
   He will my Shield and Portion be,
   As long as life endures.

5. When we’ve been there ten thousand years,
   Bright shining as the sun,
   We’ve no less days to sing God’s praise
   Than when we’d first begun.
' || char(10) || 'CLOSING PRAYER'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = '7db7a6ef-5bb3-44c8-9834-6a337deb5224'
  AND content_type = 'devotional'
  AND instr(content, 'CLOSING PRAYER') > 0
  AND instr(content, 'HYMNS FOR DAY 1') = 0;
