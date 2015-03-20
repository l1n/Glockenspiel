import yaml
from boxsdk import OAuth2
from boxsdk import Client
from wsgiref.simple_server import WSGIServer, WSGIRequestHandler, make_server

datafile = None
gsms = None
oauth = None
client = None

datafile = open('data.yml', 'r'):
gsms = yaml.load(datafile)
datafile.close

oauth = OAuth2(
    client_id=gsms.client_id,
    client_secret=gsms.client_secret,
    access_token=gsms.access_token,
    refresh_token=gsms.refresh_token,
    store_tokens=store_tokens,
)

if gsms.access_token is None or gsms.refresh_token is None:
    auth_url, csrf_token = oauth.get_authorization_url('http://hpmor.com/')
else:
    access_token, refresh_token = oauth.authenticate('')

def store_tokens(access_token, refresh_token):
    gsms.access_token = access_token
    gsms.refresh_token = refresh_token
    datafile = open('data.yml', 'w'):
    yaml.dump(gsms, datafile)
    datafile.close

client = Client(oauth)
