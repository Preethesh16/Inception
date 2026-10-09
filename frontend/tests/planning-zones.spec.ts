import {expect} from '@playwright/test';
import {test} from './fixtures';
test('dashboard displays a continuous zone across matching hospital reports with Pip guidance', async({page,request})=>{
  test.setTimeout(90000);
  const headers={'X-Demo-Session':'demo-judge'};
  await request.post('/api/demo/finish',{headers});
  for(const facility_id of ['A','B','D']){
    const r=await request.post('/api/outbreak-reports',{headers,data:{facility_id,onset_at:'2026-10-05T00:00:00+00:00',category:'Suspected demand surge',supply_ids:['ORS'],additional_units:{},note:''}});
    expect(r.ok()).toBeTruthy();
  }
  await expect.poll(async()=>{
    const s=await (await request.get('/api/snapshot',{headers})).json();
    return s.incidents.length;
  },{timeout:60000}).toBe(1);
  await page.goto('/login');
  await page.getByLabel('Email',{exact:true}).fill('admin@kaveri.demo');
  await page.getByLabel('Password',{exact:true}).fill('Demo@2026');
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await page.locator('.nearby-hospitals').scrollIntoViewIfNeeded();
  const zones=page.getByRole('region',{name:'Active planning zones'});
  await expect(page.locator('.nearby-zone-list button')).toHaveCount(1);
  await expect(page.locator('.nearby-map path[stroke="#d97706"]')).toHaveCount(1);
  await page.locator('.nearby-zone-list button').filter({hasText:'Mandya'}).click();
  await expect(page.locator('.mascot-intro h2')).toHaveText('Reported operational planning zone');
  await expect(page.locator('.mascot-intro')).toContainText('Mandya Regional Hospital');
});

test('different medicines keep separate labelled colours and zones', async({page,request})=>{
  test.setTimeout(90000);
  const headers={'X-Demo-Session':'demo-judge'};
  await request.post('/api/demo/finish',{headers});
  for(const facility_id of ['A','B','D']){
    const r=await request.post('/api/outbreak-reports',{headers,data:{facility_id,onset_at:'2026-10-05T00:00:00+00:00',category:'Suspected demand surge',supply_ids:[facility_id === 'D' ? 'SAL' : 'ORS'],additional_units:{},note:''}});
    expect(r.ok()).toBeTruthy();
  }
  await expect.poll(async()=>{
    const s=await (await request.get('/api/snapshot',{headers})).json();
    return s.incidents.length;
  },{timeout:60000}).toBe(2);
  await page.goto('/login');
  await page.getByLabel('Email',{exact:true}).fill('admin@kaveri.demo');
  await page.getByLabel('Password',{exact:true}).fill('Demo@2026');
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await page.locator('.nearby-hospitals').scrollIntoViewIfNeeded();

  await expect(page.locator('.nearby-zone-list button')).toHaveCount(2);
  await expect(page.locator('.nearby-map path[stroke="#d97706"]')).toHaveCount(1);
  await expect(page.locator('.nearby-map path[stroke="#7c3aed"]')).toHaveCount(1);
  await expect(page.locator('.nearby-legend')).toContainText('Oral rehydration salts');
  await expect(page.locator('.nearby-legend')).toContainText('IV saline 500 ml');
  await page.locator('.nearby-zone-list button').filter({hasText:'Mandya'}).click();
  await expect(page.locator('.mascot-intro h2')).toHaveText('Reported operational planning zone');
  await expect(page.locator('.mascot-intro')).toContainText('IV saline 500 ml');
});
