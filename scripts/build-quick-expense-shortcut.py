import plistlib,uuid
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='Build the public Apple Shortcut template; sign on macOS before distributing.')
parser.add_argument('--output',default='/tmp/Finance Tracker Quick Expense.unsigned.wflow')
out=Path(parser.parse_args().output)
actions=[]
def action(identifier, **p):
 uid=str(uuid.uuid4()).upper();p['UUID']=uid;actions.append({'WFWorkflowActionIdentifier':'is.workflow.actions.'+identifier,'WFWorkflowActionParameters':p});return uid
def ref(uid,name):return {'Value':{'OutputUUID':uid,'OutputName':name,'Type':'ActionOutput'},'WFSerializationType':'WFTextTokenAttachment'}
def text(parts):
 value='';attachments={}
 for part in parts:
  if isinstance(part,dict):attachments['{'+str(len(value))+', 1}']=part['Value'];value+='\ufffc'
  else:value+=part
 return {'Value':{'string':value,'attachmentsByRange':attachments},'WFSerializationType':'WFTextTokenString'}
def dictionary(items):
 return {'Value':{'WFDictionaryFieldValueItems':[{'WFItemType':0,'WFKey':text([k]),'WFValue':v if isinstance(v,dict) and v.get('WFSerializationType')=='WFTextTokenString' else text([v])} for k,v in items.items()]},'WFSerializationType':'WFDictionaryFieldValue'}
key=action('gettext',WFTextActionText='PASTE_YOUR_PRIVATE_CONNECTION_KEY')
amount=action('ask',WFInputType='Number',WFAskActionPrompt='Expense amount (PHP)',WFAskActionAllowsDecimalNumbers=True,WFAskActionAllowsNegativeNumbers=False)
items=action('list',WFItems=['Food & Dining','Transport','Utilities','Laundry & Home','Shopping','Other'])
category=action('choosefromlist',WFInput=ref(items,'List'),WFChooseFromListActionPrompt='Expense category',WFChooseFromListActionSelectMultiple=False)
merchant=action('ask',WFInputType='Text',WFAskActionPrompt='Merchant / purchase name')
url=action('url',WFURLActionURL='https://financetracker.wyndellgingoyon.com/api/quick-expense')
wallet_response=action('downloadurl',WFURL=text([ref(url,'URL')]),WFHTTPMethod='POST',WFHTTPBodyType='JSON',WFHTTPHeaders=dictionary({'Authorization':text(['Bearer ',ref(key,'Text')]),'Content-Type':'application/json'}),WFJSONValues=dictionary({'action':'wallets'}))
wallet_error=action('getvalueforkey',WFInput=ref(wallet_response,'Contents of URL'),WFDictionaryKey='message',WFGetDictionaryValueType='Value')
guard=str(uuid.uuid4()).upper()
action('conditional',WFInput={'Type':'Variable','Variable':ref(wallet_error,'Dictionary Value')},WFCondition=100,WFControlFlowMode=0,GroupingIdentifier=guard)
action('showresult',Text=text([ref(wallet_error,'Dictionary Value')]))
action('exit')
action('conditional',WFControlFlowMode=2,GroupingIdentifier=guard)
wallet_choices=action('getvalueforkey',WFInput=ref(wallet_response,'Contents of URL'),WFDictionaryKey='walletChoices',WFGetDictionaryValueType='Value')
wallet_labels=action('getvalueforkey',WFInput=ref(wallet_choices,'Dictionary Value'),WFGetDictionaryValueType='All Keys')
wallet_choice=action('choosefromlist',WFInput=ref(wallet_labels,'Dictionary Value'),WFChooseFromListActionPrompt='Payment wallet',WFChooseFromListActionSelectMultiple=False)
wallet_id=action('getvalueforkey',WFInput=ref(wallet_choices,'Dictionary Value'),WFDictionaryKey=text([ref(wallet_choice,'Chosen Item')]),WFGetDictionaryValueType='Value')
random1=action('number.random',WFRandomNumberMinimum=10000000,WFRandomNumberMaximum=99999999)
random2=action('number.random',WFRandomNumberMinimum=100000000000,WFRandomNumberMaximum=999999999999)
seed=action('gettext',WFTextActionText=text([ref(random1,'Random Number'),'-',ref(random2,'Random Number')]))
request=action('hash',WFInput=ref(seed,'Text'),WFHashType='SHA256')
now=action('date',WFDateActionMode='Current Date')
day=action('format.date',WFDate=text([ref(now,'Date')]),WFDateFormatStyle='Custom',WFDateFormat='yyyy-MM-dd')
result=action('downloadurl',WFURL=text([ref(url,'URL')]),WFHTTPMethod='POST',WFHTTPBodyType='JSON',WFHTTPHeaders=dictionary({'Authorization':text(['Bearer ',ref(key,'Text')]),'Content-Type':'application/json'}),WFJSONValues=dictionary({'action':'expense','requestId':ref(request,'Hash'),'amount':ref(amount,'Ask for Input'),'category':ref(category,'Chosen Item'),'merchant':ref(merchant,'Ask for Input'),'date':ref(day,'Formatted Date'),'walletId':ref(wallet_id,'Dictionary Value')}))
success=action('getvalueforkey',WFInput=ref(result,'Contents of URL'),WFDictionaryKey='success',WFGetDictionaryValueType='Value')
success_number=action('number',WFNumberActionNumber=ref(success,'Dictionary Value'))
saved=str(uuid.uuid4()).upper()
action('conditional',WFInput={'Type':'Variable','Variable':ref(success_number,'Number')},WFCondition=4,WFNumberValue='1',WFControlFlowMode=0,GroupingIdentifier=saved)
action('exit')
action('conditional',WFControlFlowMode=2,GroupingIdentifier=saved)
message=action('getvalueforkey',WFInput=ref(result,'Contents of URL'),WFDictionaryKey='message',WFGetDictionaryValueType='Value')
has_message=str(uuid.uuid4()).upper()
action('conditional',WFInput={'Type':'Variable','Variable':ref(message,'Dictionary Value')},WFCondition=100,WFControlFlowMode=0,GroupingIdentifier=has_message)
action('showresult',Text=text([ref(message,'Dictionary Value')]))
action('exit')
action('conditional',WFControlFlowMode=2,GroupingIdentifier=has_message)
action('showresult',Text='Save status unknown. Check History before starting a new expense.')
workflow={'WFWorkflowName':'Finance Tracker Quick Expense','WFWorkflowActions':actions,'WFWorkflowClientVersion':'4046.0.2.2','WFWorkflowMinimumClientVersion':900,'WFWorkflowMinimumClientVersionString':'900','WFWorkflowIcon':{'WFWorkflowIconStartColor':4282601983,'WFWorkflowIconGlyphNumber':59511},'WFWorkflowTypes':[],'WFWorkflowInputContentItemClasses':[],'WFWorkflowImportQuestions':[{'ActionIndex':0,'Category':'Parameter','ParameterKey':'WFTextActionText','DefaultValue':'PASTE_YOUR_PRIVATE_CONNECTION_KEY','Text':'Paste the private connection key from Finance Tracker → Settings → General → Quick Expense. This key can add expenses to the wallets authorized when you connected it. Never share your configured shortcut.'}]}
workflow.update({'WFWorkflowClientRelease':'3.0','WFWorkflowOutputContentItemClasses':[],'WFQuickActionSurfaces':[],'WFWorkflowHasOutput':False,'WFWorkflowNoInputBehavior':{'Name':'WFWorkflowNoInputBehaviorShowNothing','Parameters':{}}})
out.write_bytes(plistlib.dumps(workflow,fmt=plistlib.FMT_XML))
print(out)
