"""Generate small, fictional assets; no external data or services."""
from pathlib import Path
from PIL import Image, ImageDraw
out=Path(__file__).parent/'public'/'samples'
images=[('screen.png','ACCOUNT RECOVERY','FICTIONAL DEMO — NOT A REAL ACCOUNT','Send your recovery code to this chat.','Recorded scenario; no live OCR.'),('public-image.jpg','COMMUNITY MEETUP','FICTIONAL PUBLIC EVENT','Friday at 10 AM • Community hall','Everyone is welcome.'),('restricted-image.png','THREATLOCK DEMO: RESTRICTED','FICTIONAL WHITEBOARD','PROJECT NIGHTFALL','Synthetic planning sample. Do not share.')]
for filename,*lines in images:
    im=Image.new('RGB',(800,500),'#f4f6ef');d=ImageDraw.Draw(im)
    d.rounded_rectangle((30,30,770,470),radius=18,fill='#ffffff',outline='#aab89c',width=2)
    for i,line in enumerate(lines):d.text((65,90+i*80),line,fill='#294b39',font_size=28 if i==0 else 19)
    im.save(out/filename)
def pdf(filename,lines):
    content='BT /F1 16 Tf 50 740 Td '
    for i,line in enumerate(lines):
        escaped=line.replace('\\','\\\\').replace('(','\\(').replace(')','\\)')
        content+=('0 -42 Td ' if i else '')+'('+escaped+') Tj '
    content+='ET'
    objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',f'<< /Length {len(content.encode())} >>\nstream\n{content}\nendstream']
    data=b'%PDF-1.4\n';offsets=[0]
    for i,obj in enumerate(objects,1):
        offsets.append(len(data));data+=f'{i} 0 obj\n{obj}\nendobj\n'.encode()
    start=len(data);data+=f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'.encode()
    for offset in offsets[1:]:data+=f'{offset:010d} 00000 n \n'.encode()
    data+=f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n'.encode();(out/filename).write_bytes(data)
pdf('brief.pdf',['FICTIONAL PUBLIC EVENT','Community meetup agenda','Friday, 10 AM: Welcome','10:30 AM: Open workshop','This synthetic sample contains no personal data.'])
pdf('restricted.pdf',['THREATLOCK DEMO: RESTRICTED','PROJECT NIGHTFALL','Synthetic roadmap for policy testing.','No actual confidential information.'])
pdf('secret-note.pdf',['THREATLOCK DEMO: RESTRICTED','TL-DEMO-SECRET-SAMPLE-001','Synthetic secret. Not a valid credential.'])
