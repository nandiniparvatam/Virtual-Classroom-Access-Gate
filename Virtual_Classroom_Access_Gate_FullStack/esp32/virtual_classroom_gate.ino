/*
  ESP32 + MFRC522 + AWS IoT Core
  Libraries: MFRC522, PubSubClient, ArduinoJson
  MFRC522: SDA=5, SCK=18, MOSI=23, MISO=19, RST=22, VCC=3.3V, GND=GND
  Green LED (with resistor)=GPIO26; Red LED (with resistor)=GPIO27
  Fill all Wi-Fi/AWS certificate placeholders before upload. Never commit keys.
*/
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>
#define SS_PIN 5
#define RST_PIN 22
#define GREEN_LED 26
#define RED_LED 27
const char* WIFI_SSID="YOUR_WIFI_NAME";
const char* WIFI_PASSWORD="YOUR_WIFI_PASSWORD";
const char* AWS_ENDPOINT="YOUR_IOT_DATA_ATS_ENDPOINT";
const char* DEVICE_ID="classroom-gate-01";
const char* REQUEST_TOPIC="classroom/access/request";
const char* ROOT_CA=R"EOF(
-----BEGIN CERTIFICATE-----
PASTE_AMAZON_ROOT_CA_1_HERE
-----END CERTIFICATE-----
)EOF";
const char* DEVICE_CERT=R"EOF(
-----BEGIN CERTIFICATE-----
PASTE_DEVICE_CERTIFICATE_HERE
-----END CERTIFICATE-----
)EOF";
const char* PRIVATE_KEY=R"EOF(
-----BEGIN RSA PRIVATE KEY-----
PASTE_DEVICE_PRIVATE_KEY_HERE
-----END RSA PRIVATE KEY-----
)EOF";
String responseTopic=String("classroom/access/response/")+DEVICE_ID;
WiFiClientSecure tls; PubSubClient mqtt(tls); MFRC522 reader(SS_PIN,RST_PIN);
String getUID(){String s="";for(byte i=0;i<reader.uid.size;i++){if(reader.uid.uidByte[i]<16)s+="0";s+=String(reader.uid.uidByte[i],HEX);}s.toUpperCase();return s;}
void ledResult(bool ok){digitalWrite(GREEN_LED,ok?HIGH:LOW);digitalWrite(RED_LED,ok?LOW:HIGH);}
void onMessage(char* topic,byte* payload,unsigned int len){StaticJsonDocument<384>d;if(deserializeJson(d,payload,len))return;bool ok=d["allowed"]|false;Serial.printf("Access %s for card %s\n",ok?"GRANTED":"DENIED",String((const char*)d["cardId"]).c_str());ledResult(ok);delay(2200);digitalWrite(GREEN_LED,LOW);digitalWrite(RED_LED,LOW);}
bool connectMqtt(){if(mqtt.connected())return true;String id=String(DEVICE_ID)+"-"+String((uint32_t)ESP.getEfuseMac(),HEX);if(mqtt.connect(id.c_str())){mqtt.subscribe(responseTopic.c_str(),1);return true;}return false;}
void setup(){Serial.begin(115200);pinMode(GREEN_LED,OUTPUT);pinMode(RED_LED,OUTPUT);SPI.begin();reader.PCD_Init();WiFi.begin(WIFI_SSID,WIFI_PASSWORD);while(WiFi.status()!=WL_CONNECTED){delay(500);Serial.print(".");}tls.setCACert(ROOT_CA);tls.setCertificate(DEVICE_CERT);tls.setPrivateKey(PRIVATE_KEY);mqtt.setServer(AWS_ENDPOINT,8883);mqtt.setCallback(onMessage);mqtt.setBufferSize(512);connectMqtt();Serial.println("RFID gate ready");}
void loop(){if(!mqtt.connected())connectMqtt();mqtt.loop();if(!reader.PICC_IsNewCardPresent()||!reader.PICC_ReadCardSerial())return;String card=getUID();Serial.println("RFID: "+card);if(mqtt.connected()){StaticJsonDocument<160>d;d["cardId"]=card;d["deviceId"]=DEVICE_ID;char buf[160];size_t n=serializeJson(d,buf);mqtt.publish(REQUEST_TOPIC,(uint8_t*)buf,n);}else{ledResult(false);delay(900);digitalWrite(RED_LED,LOW);}reader.PICC_HaltA();reader.PCD_StopCrypto1();delay(1200);}
