var size = 10;
var sol = new Objet('sol');

for(var z=-size; z<=size; z++)
    for(var x=-size; x<=size; x++)
        sol.ptAdd(30.*x/size, 0, 20*z/size);


for(var l=0; l<2*size; l++)
{
    for(var k=0; k<2*size; k++)
    {
        var i0 = (k+0)+(l+0)*(2*size+1)+1;
        var i1 = (k+1)+(l+0)*(2*size+1)+1;
        var i2 = (k+1)+(l+1)*(2*size+1)+1;
        var i3 = (k+0)+(l+1)*(2*size+1)+1;
        sol.fcAdd(i0, i2, i1, [250, 250, 250]);
        sol.fcAdd(i0, i3, i2, [250, 250, 250]);
    }
}
sol.ready();
