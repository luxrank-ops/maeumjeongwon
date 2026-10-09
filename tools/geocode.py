import json,time,urllib.request,urllib.parse
T=[("haeinsa","해인사","합천"),("tongdosa","통도사","양산"),("songgwangsa","송광사","순천"),("sudeoksa","수덕사","예산"),("baegyangsa","백양사","장성"),("donghwasa","동화사","대구"),("ssanggyesa","쌍계사","하동"),("buseoksa","부석사","영주"),("bongjeongsa","봉정사","안동"),("beopjusa","법주사","보은"),("magoksa","마곡사","공주"),("seonamsa","선암사","순천"),("daeheungsa","대흥사","해남"),("naksansa","낙산사","양양"),("hongnyeonam","홍련암","양양"),("bomunsa","보문사","강화"),("boriam","보리암","남해"),("sangwonsa","상원사","평창"),("jungdae","중대 사자암","평창"),("jeongamsa","정암사","정선"),("bongjeongam","봉정암","인제"),("beopheungsa","법흥사","영월"),("yonggungsa","해동용궁사","기장"),("gatbawi","갓바위","경산"),("seonbonsa","선본사","경산"),("hyangiram","향일암","여수"),("unmunsa","운문사","청도"),("sariam","사리암","청도"),("bulguksa","불국사","경주"),("seokguram","석굴암","경주"),("bogwangsa","보광사","파주"),("woljeongsa","월정사","평창"),("hwaeomsa","화엄사","구례"),("beomeosa","범어사","금정"),("jogyesa","조계사","종로"),("bongeunsa","봉은사","강남"),("naesosa","내소사","부안"),("jeondeungsa","전등사","강화"),("geumsansa","금산사","김제"),("jikjisa","직지사","김천"),("baekdamsa","백담사","인제"),("mihwangsa","미황사","해남"),("naejangsa","내장사","정읍"),("cheongnyangsa","청량사","봉화"),("guinsa","구인사","단양"),("yongjusa","용주사","화성")]
out={}
for id,q,r in T:
  url="https://nominatim.openstreetmap.org/search?"+urllib.parse.urlencode({"q":q,"format":"json","countrycodes":"kr","limit":15})
  d=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"maeumjeongwon-prototype/0.1"})))
  c=[x for x in d if r in x["display_name"]]
  c.sort(key=lambda x:(x.get("class")!="amenity" and x.get("type")!="religious", ))
  if c: out[id]=[round(float(c[0]["lat"]),5),round(float(c[0]["lon"]),5),c[0]["display_name"][:60]]
  else: out[id]=None
  print(id,out[id],flush=True); time.sleep(1.2)
json.dump(out,open("/workspace/coords.json","w"),ensure_ascii=False,indent=1)
