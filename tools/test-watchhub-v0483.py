"""Offline behavioral checks of official-only WatchHub source adapter."""
import asyncio
import importlib.util
from pathlib import Path
import sys
import types

fake_aiohttp = types.ModuleType('aiohttp')
fake_aiohttp.ClientError = type('ClientError', (Exception,), {})
fake_aiohttp.ClientSession = object
class Timeout:
    def __init__(self, total): self.total = total
fake_aiohttp.ClientTimeout = Timeout
sys.modules['aiohttp'] = fake_aiohttp
spec = importlib.util.spec_from_file_location('watchhub_test',
    Path('custom_components/streaming_browser/watchhub.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

assert module.official_provider_url('https://www.netflix.com/title/123')[0] == 'Netflix'
assert module.official_provider_url('https://www.disneyplus.com/movies/foo')[0] == 'Disney+'
for dangerous in ('http://netflix.com/a', 'https://netflix.com.evil.test/a',
                  'https://evil.test@netflix.com/a', 'https://cdn.example.test/file.m3u8',
                  'https://www.netflix.com/file.mp4'):
    assert module.official_provider_url(dangerous) is None, dangerous
assert module._country_matches({'geos':['US']},'MX') is False
assert module._country_matches({'geos':['MX']},'MX') is True

class Reply:
    def __init__(self, payload): self.payload=payload
    async def __aenter__(self): return self
    async def __aexit__(self,*args): return False
    def raise_for_status(self): pass
    async def json(self, content_type=None): return self.payload
class Session:
    def __init__(self): self.urls=[]
    def get(self,url,timeout=None):
        self.urls.append(url)
        return Reply({'streams':[
            {'name':'Netflix','externalUrl':'https://www.netflix.com/watch/exact','geos':['MX']},
            {'name':'Netflix','externalUrl':'https://www.netflix.com/watch/wrong','geos':['US']},
            {'name':'Unrelated','url':'https://cdn.example.test/file.mp4'},
            {'name':'Spoof','externalUrl':'https://netflix.com.bad.example/watch/exact'},
        ]})
async def test():
    session=Session()
    movie=await module.provider_links(session,imdb_id='tt1234567',region='MX',media_type='movie')
    assert len(movie)==1 and movie[0]['name']=='Netflix' and movie[0]['scope']=='movie'
    assert session.urls[0]=='https://watchhub-mx.strem.io/stream/movie/tt1234567.json'
    episode=await module.provider_links(session,imdb_id='tt1234567',region='ES',
        media_type='series',season=2,episode=4)
    assert episode==[], 'other-country sources must be filtered out'
    assert session.urls[1]=='https://watchhub-es.strem.io/stream/series/tt1234567:2:4.json'
    for kwargs in ({'imdb_id':'../../bad','region':'MX','media_type':'movie'},
                   {'imdb_id':'tt1234567','region':'MXX','media_type':'movie'},
                   {'imdb_id':'tt1234567','region':'MX','media_type':'series'}):
        try: await module.provider_links(session,**kwargs)
        except ValueError: pass
        else: raise AssertionError(f'accepted invalid WatchHub request: {kwargs}')
    print('PASS WatchHub official-only URLs, geo filtering, exact episode IDs, rejection of streams and invalid identifiers')
asyncio.run(test())
