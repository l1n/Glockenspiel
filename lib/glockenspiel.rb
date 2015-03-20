require 'dotenv'; Dotenv.load("../.env")
require 'boxr'
require 'dotenv'; Dotenv.load("../.env")
require 'boxr'
require 'uri'

#make sure you have BOX_CLIENT_ID and BOX_CLIENT_SECRET set in your .env file
#make sure you have the redirect_uri for your application set to something like https://localhost:1234 in the developer portal

oauth_url = Boxr::oauth_url(URI.encode_www_form_component('your-anti-forgery-token'))
system "xdg-open #{oauth_url}"

print "Enter the code: "
code = STDIN.gets.chomp.split('=').last

puts Boxr::get_tokens(code)
