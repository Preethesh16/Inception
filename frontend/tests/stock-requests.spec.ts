import {expect} from '@playwright/test';
import {test} from './fixtures';
test('hospitals manually request, offer and accept with advisory review',async({page,context,request})=>{
  test.setTimeout(90000);
  const headers={'X-Demo-Session':'demo-judge'};
  await request.post('/api/demo/finish',{headers});
  await expect.poll(async()=>{
    const s=await (await request.get('/api/snapshot',{headers})).json();
    return s.jobs.some((j:any)=>['queued','running'].includes(j.status));
  },{timeout:60000}).toBe(false);
  async function login(p:typeof page,email:string){
    await p.emulateMedia({reducedMotion:'reduce'});
    await p.goto('/login');
    await p.getByLabel('Email',{exact:true}).fill(email);
    await p.getByLabel('Password',{exact:true}).fill('Demo@2026');
    await p.getByRole('button',{name:'Log in',exact:true}).click();
    await p.getByRole('button',{name:'Stock requests',exact:true}).click();
  }
  await login(page,'admin@kaveri.demo');
  await page.getByLabel('Nearby hospital').selectOption('B');
  await page.getByLabel('Product',{exact:true}).selectOption('ORS');
  await page.getByLabel('Requested quantity').fill('200');
  await page.getByLabel('Why do you need this stock?').fill('Extra clinic demand outside the current forecast');
  await page.getByRole('button',{name:'Send request',exact:true}).click();
  await expect(page.locator('.request-card')).toHaveCount(1);
  const donor=await context.newPage();
  await login(donor,'admin@chamundi.demo');
  await donor.getByRole('button',{name:'Use suggested quantity'}).click();
  await expect(donor.getByLabel('Quantity to offer')).toHaveValue('200');
  await donor.getByLabel('Reply message').fill('We can offer these ORS lots.');
  await donor.getByRole('button',{name:'Agree and send offer'}).click();
  await expect(page.locator('.request-heading')).toContainText('Offered',{timeout:15000});
  await page.getByLabel('Reason for accepting more than forecast recommends').fill('Confirmed extra clinic activity requires 200 sachets.');
  await page.getByRole('button',{name:'Accept offer and reserve stock'}).click();
  await expect(page.locator('.request-heading')).toContainText('Accepted');
  await expect(donor.locator('.request-heading')).toContainText('Accepted',{timeout:15000});
  await expect(page.locator('.request-card')).toContainText('track delivery in Approvals');
});
