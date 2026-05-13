function Matrix()
{
    this.v = [[0.,0.,0.,0.],[0.,0.,0.,0.],[0.,0.,0.,0.],[0.,0.,0.,0.]];
    this.pile = new Array();
    return this;
}

Matrix.prototype.Vide = function()
{
    this.v = [[0.,0.,0.,0.],
              [0.,0.,0.,0.],
              [0.,0.,0.,0.],
              [0.,0.,0.,0.]];
    return this;
}

Matrix.prototype.Identite = function()
{
    this.v = [[1.,0.,0.,0.],
              [0.,1.,0.,0.],
              [0.,0.,1.,0.],
              [0.,0.,0.,1.]];
    return this;
}

Matrix.prototype.Translation = function(tx, ty, tz)
{
    this.v = [[1.,0.,0.,0.],
              [0.,1.,0.,0.],
              [0.,0.,1.,0.],
              [tx,ty,tz,1.]];
    return this;
}

Matrix.prototype.Scale = function(sx, sy, sz)
{
    this.v = [[sx,0.,0.,0.],
              [0.,sy,0.,0.],
              [0.,0.,sz,0.],
              [0.,0.,0.,1.]];
    return this;
}

Matrix.prototype.RotationX = function(rx)
{
    var c = Math.cos(rx);
    var s = Math.sin(rx);

    this.v = [[1.,0.,0.,0.],
              [0., c, s,0.],
              [0.,-s, c,0.],
              [0.,0.,0.,1.]];
    return this;
}

Matrix.prototype.RotationY = function(ry)
{
    var c = Math.cos(ry);
    var s = Math.sin(ry);

    this.v = [[ c,0.,-s,0.],
              [0.,1.,0.,0.],
              [ s,0., c,0.],
              [0.,0.,0.,1.]];
    return this;
}

Matrix.prototype.RotationZ = function(rz)
{
    var c = Math.cos(rz);
    var s = Math.sin(rz);

    this.v = [[ c, s,0.,0.],
              [-s, c,0.,0.],
              [0.,0.,1.,0.],
              [0.,0.,0.,1.]];

    return this;
}

Matrix.prototype.Multiplication = function(m)
{
    var a = this.v;
    var b = m.v;
    this.Vide();

    for(var x=0; x<4; x++)
    {
        this.v[x][0] = a[0][0]*b[x][0] + a[1][0]*b[x][1] + a[2][0]*b[x][2] + a[3][0]*b[x][3];
        this.v[x][1] = a[0][1]*b[x][0] + a[1][1]*b[x][1] + a[2][1]*b[x][2] + a[3][1]*b[x][3];
        this.v[x][2] = a[0][2]*b[x][0] + a[1][2]*b[x][1] + a[2][2]*b[x][2] + a[3][2]*b[x][3];
        this.v[x][3] = a[0][3]*b[x][0] + a[1][3]*b[x][1] + a[2][3]*b[x][2] + a[3][3]*b[x][3];
    }

    return this;
}

Matrix.prototype.MultiplicationPos = function(pos)
{
    pos[3] = 1;
    var res = new Array();

    res[0] = this.v[0][0]*pos[0] + this.v[1][0]*pos[1] + this.v[2][0]*pos[2] + this.v[3][0]*pos[3];
    res[1] = this.v[0][1]*pos[0] + this.v[1][1]*pos[1] + this.v[2][1]*pos[2] + this.v[3][1]*pos[3];
    res[2] = this.v[0][2]*pos[0] + this.v[1][2]*pos[1] + this.v[2][2]*pos[2] + this.v[3][2]*pos[3];
    res[3] = 1;

    return res;
}

Matrix.prototype.Push = function()
{
    this.pile.push(this.v);
    return this;
}

Matrix.prototype.Pop = function()
{
    this.v = this.pile.pop();
    return this;
}

Matrix.prototype.Draw = function()
{
    var txt = '';
    txt+= "----------------------\n";
    for(var y=0; y<4; y++)
    {
        txt+= "[";
        for(var x=0; x<4; x++)
        {
            txt+= this.v[x][y]+' ';
        }
        txt+= "]\n";
    }
    txt+= "----------------------\n";
    alert(txt);
    return this;
}
