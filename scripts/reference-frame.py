import json,math
from pathlib import Path
root=Path('.'); original=json.loads((Path(__file__).parent/'fixtures/audit-original-frame.json').read_text(encoding='utf-8-sig'));m=original['model'];nodes={n['id']:n for n in m['nodes']};center=next(n for n in m['nodes'] if n['support']=='free'); cid=center['id']
def linear(A,b):
 A=[list(row)+[v] for row,v in zip(A,b)];n=len(b)
 for k in range(n):
  p=max(range(k,n),key=lambda i:abs(A[i][k]));A[k],A[p]=A[p],A[k]
  if abs(A[k][k])<1e-20:raise ValueError('singular')
  v=A[k][k];A[k]=[x/v for x in A[k]]
  for i in range(n):
   if i!=k:
    v=A[i][k];A[i]=[x-v*y for x,y in zip(A[i],A[k])]
 return [row[-1] for row in A]
def reference(model,F):
 ns={n['id']:n for n in model['nodes']};c=ns[cid];K=[[0.]*3 for _ in range(3)];arms=[]
 for index,b in enumerate(model['beams']):
  assert cid in (b['a'],b['b']) and b['kind']=='beam'
  wall=ns[b['b'] if b['a']==cid else b['a']];dx=wall['x']-c['x'];dy=wall['y']-c['y'];L=math.hypot(dx,dy);n=(dx/L,dy/L);t=(-n[1],n[0]);ka=b['E']*b['A']/L;kb=3*b['E']*b['I']/L**3
  for i in range(2):
   for j in range(2):K[i][j]+=ka*n[i]*n[j]+kb*t[i]*t[j]
   K[i][2]+=kb*L*t[i];K[2][i]+=kb*L*t[i]
  K[2][2]+=kb*L*L;arms.append((index,b,wall,L,n,t,ka,kb))
 U=linear(K,F);reactions=[];members=[]
 for index,b,wall,L,n,t,ka,kb in arms:
  u=U[0]*n[0]+U[1]*n[1];v=U[0]*t[0]+U[1]*t[1];shear=kb*(v+L*U[2]);moment=shear*L;rx=-ka*u*n[0]-shear*t[0];ry=-ka*u*n[1]-shear*t[1]
  reactions.append(dict(node=wall['id'],fx=rx,fy=ry,m=0,resultant=math.hypot(rx,ry)))
  members.append(dict(beam=b['id'],label='B'+str(index+1),L=L,angle=math.degrees(math.atan2(ns[b['b']]['y']-ns[b['a']]['y'],ns[b['b']]['x']-ns[b['a']]['x'])),N=-ka*u,V=shear,Mstart=-moment if b['a']==cid else 0,Mend=moment if b['b']==cid else 0,Mabs=abs(moment)))
 residual=[F[0]+sum(r['fx'] for r in reactions),F[1]+sum(r['fy'] for r in reactions),F[2]+c['x']*F[1]-c['y']*F[0]+sum(ns[r['node']]['x']*r['fy']-ns[r['node']]['y']*r['fx']+r['m'] for r in reactions)]
 return dict(U=U,reactions=reactions,members=members,residual=residual,K=K)
base=reference(m,[3,-12,1]);cases=[]
for x in [1,-1]:
 for y in [1,-1]:
  for z in [1,-1]:cases.append(dict(id=f"({x:+},{y:+},{z:+})",Fx=3*x,Fy=12*y,M=1*z,**reference(m,[3*x,12*y,z])))
def extremes(rows,key):
 vals=[(r[key],c['id']) for c,r in rows];lo=min(vals);hi=max(vals);ab=max(vals,key=lambda x:abs(x[0]));return dict(min=lo,max=hi,maxAbs=[abs(ab[0]),ab[1]])
envelope={}
for r in base['reactions']:
 rows=[(c,next(x for x in c['reactions'] if x['node']==r['node'])) for c in cases];envelope[r['node']]={k:extremes(rows,k) for k in ['fx','fy','resultant']}
for r in base['members']:
 rows=[(c,next(x for x in c['members'] if x['beam']==r['beam'])) for c in cases];envelope[r['label']]={k:extremes(rows,k) for k in ['N','V','Mstart','Mend','Mabs']}
drawing=json.loads(json.dumps(m));xy={'N1':(-3.090,2.304),'N2':(1.890,-1.393),'N3':(-3.090,-2.312),'N4':(1.890,1.393),cid:(0,0)}
for n in drawing['nodes']:n['x'],n['y']=xy[n['id']]
drawing['constraints']=[];drawing['dimensions']=[]
result=dict(method='Independent closed-form condensation of outer pin rotations; 3x3 central equilibrium solved in Python standard library, no production solver imports',source=original['name'],center=cid,baseline=base,cases=cases,envelopes=envelope,drawingScenario=reference(drawing,[3,-12,1]),model=m)
(Path(__file__).parent/'fixtures/audit-reference.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(base,indent=2))
