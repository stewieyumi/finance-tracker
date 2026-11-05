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
 return {'Value':{'WFDictionaryFieldValueItems':[{'WFItemType':0,'WFKey':text([k]),'WFValue':v if isinstance(v,dict) else text([v])} for k,v in items.items()]},'WFSerializationType':'WFDictionaryFieldValue'}
key=action('gettext',WFTextActionText='PASTE_YOUR_PRIVATE_CONNECTION_KEY')
amount=action('ask',WFInputType='Number',WFAskActionPrompt='Expense amount (PHP)',WFAskActionAllowsDecimalNumbers=True,WFAskActionAllowsNegativeNumbers=False)
items=action('list',WFItems=['Food & Dining','Transport','Utilities','Laundry & Home','Shopping','Other'])
category=action('choosefromlist',WFInput=ref(items,'List'),WFChooseFromListActionPrompt='Expense category',WFChooseFromListActionSelectMultiple=False)
merchant=action('ask',WFInputType='Text',WFAskActionPrompt='Merchant / purchase name')
confirm=action('alert',WFAlertActionTitle='Save expense to Finance Tracker?',WFAlertActionMessage=text(['PHP ',ref(amount,'Ask for Input'),' · ',ref(category,'Chosen Item'),'\n',ref(merchant,'Ask for Input'),'\nUses the wallet you connected in Settings.']),WFAlertActionCancelButtonShown=True)
request=action('generateuuid')
now=action('date',WFDateActionMode='Current Date')
day=action('format.date',WFDate=ref(now,'Date'),WFDateFormatStyle='Custom',WFDateFormat='yyyy-MM-dd')
url=action('url',WFURLActionURL='https://financetracker.wyndellgingoyon.com/api/quick-expense')
result=action('downloadurl',WFInput=ref(url,'URL'),WFHTTPMethod='POST',WFHTTPBodyType='JSON',WFHTTPHeaders=dictionary({'Authorization':text(['Bearer ',ref(key,'Text')]),'Content-Type':'application/json'}),WFJSONValues=dictionary({'action':'expense','requestId':ref(request,'UUID'),'amount':ref(amount,'Ask for Input'),'category':ref(category,'Chosen Item'),'merchant':ref(merchant,'Ask for Input'),'date':ref(day,'Formatted Date')}))
message=action('getvalueforkey',WFInput=ref(result,'Contents of URL'),WFDictionaryKey='message',WFGetDictionaryValueType='Value')
action('showresult',Text=ref(message,'Dictionary Value'))
workflow={'WFWorkflowName':'Finance Tracker Quick Expense','WFWorkflowActions':actions,'WFWorkflowClientVersion':'4046.0.2.2','WFWorkflowMinimumClientVersion':900,'WFWorkflowMinimumClientVersionString':'900','WFWorkflowIcon':{'WFWorkflowIconStartColor':4282601983,'WFWorkflowIconGlyphNumber':59511},'WFWorkflowTypes':[],'WFWorkflowInputContentItemClasses':[],'WFWorkflowImportQuestions':[{'ActionIndex':0,'Category':'Parameter','ParameterKey':'WFTextActionText','Text':'Paste the private connection key from Finance Tracker → Settings → General → Quick Expense. This key can add expenses to your connected wallet. Never share your configured shortcut.'}]}
workflow.update({'WFWorkflowClientRelease':'3.0','WFWorkflowOutputContentItemClasses':[],'WFQuickActionSurfaces':[],'WFWorkflowHasOutput':False,'WFWorkflowNoInputBehavior':{'Name':'WFWorkflowNoInputBehaviorShowNothing','Parameters':{}}})
out.write_bytes(plistlib.dumps(workflow,fmt=plistlib.FMT_XML))
print(out)
