const nb_r = 16.;
const nb_z = 10.;
const rayon = 15.;
const f = Math.PI/180.0;

const sphere = objectRegistry['sphere'] = new Object3d('sphere');

for (let a=0.; a<=360.; a+=360./nb_r)
{
    for (let b=-90.; b<=90.; b+=180./nb_z)
    {
        var x = rayon*Math.cos(f*a)*Math.cos(f*b);
        var z = rayon*Math.sin(f*a)*Math.cos(f*b);
        var y = rayon*Math.sin(f*b);
        sphere.ptAdd(x,y,z);
    }
}

const i=0;
for (let a=0.; a<360.; a+=360./nb_r)
{
    for (let b=-90.; b<90.; b+=180./nb_z)
    {
        i++;
        if (b<90 && (i<(nb_z+1)*(nb_r+1)-6))
        {
            sphere.fcAdd(i+1, i+nb_z+1,  i,  [250., 250., 250.]);
            sphere.fcAdd(i+1, i+nb_z+2,i+nb_z+1,  [250., 250., 250.]);
        }
    }
    i++;
}
sphere.ready();