var nb_r = 16.;
var nb_z = 10.;
var rayon = 15.;
var f = Math.PI/180.0;

var sphere = new Objet('sphere');

for (var a=0.; a<=360.; a+=360./nb_r)
{
    for (var b=-90.; b<=90.; b+=180./nb_z)
    {
        var x = rayon*Math.cos(f*a)*Math.cos(f*b);
        var z = rayon*Math.sin(f*a)*Math.cos(f*b);
        var y = rayon*Math.sin(f*b);
        sphere.ptAdd(x,y,z);
    }
}

var i=0;
for (var a=0.; a<360.; a+=360./nb_r)
{
    for (var b=-90.; b<90.; b+=180./nb_z)
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